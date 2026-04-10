-- ============================================================================
-- Migration 020: Batch Cache-Check + Debit RPC for Transactions
-- ============================================================================
--
-- Creates check_cache_and_debit_batch: an atomic batch version of
-- check_cache_and_debit (migration 005/018) for the transaction endpoint.
--
-- Unlike check_cache_and_debit (1 URL per call), this function processes
-- N URLs in a single DB transaction, ensuring:
--   - All-or-nothing: if balance is insufficient for the batch total,
--     NO debits occur (prevents partial charges)
--   - Single round-trip: N URLs = 1 RPC call instead of N
--   - Cache-aware: cached grants are free, only new grants cost money
--
-- Parameters:
--   p_consumer_id: UUID of the consumer workspace
--   p_debits: JSONB array of objects, each with:
--     - publisher_workspace_id (UUID)
--     - catalog_id (UUID)
--     - agent_id (UUID)
--     - url (TEXT): normalized URL
--     - price_eur (NUMERIC): price for this URL
--     - ttl_minutes (INTEGER): grant validity
--
-- Returns JSONB:
--   On success: { success: true, new_balance: number, grants: [...] }
--     Each grant: { url, grant_id, expires_at, cached }
--   On failure: { success: false, reason: "insufficient_balance",
--                 balance: number, required: number }
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_cache_and_debit_batch(
  p_consumer_id UUID,
  p_debits JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_debit         JSONB;
  v_balance       NUMERIC;
  v_new_balance   NUMERIC;
  v_total_cost    NUMERIC := 0;
  v_grants        JSONB := '[]'::JSONB;
  v_cached_grant  public.access_grants%ROWTYPE;
  v_grant_id      UUID;
  v_expires_at    TIMESTAMPTZ;
  v_url           TEXT;
  v_price         NUMERIC;
  v_ttl           INTEGER;
  v_publisher_id  UUID;
  v_catalog_id    UUID;
  v_agent_id      UUID;
BEGIN
  -- ----------------------------------------------------------------
  -- PASS 1: Check cache for each URL, calculate total cost for new grants
  -- ----------------------------------------------------------------
  FOR v_debit IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_url   := v_debit->>'url';
    v_price := (v_debit->>'price_eur')::NUMERIC;

    -- Check for existing valid grant
    SELECT * INTO v_cached_grant
    FROM public.access_grants
    WHERE consumer_workspace_id = p_consumer_id
      AND url = v_url
      AND expires_at > now()
    LIMIT 1;

    IF FOUND THEN
      -- Cached: no charge, record grant info
      v_grants := v_grants || jsonb_build_object(
        'url',        v_url,
        'grant_id',   v_cached_grant.id,
        'expires_at', v_cached_grant.expires_at,
        'cached',     true
      );
    ELSE
      -- Not cached: will need to debit
      v_total_cost := v_total_cost + v_price;
      -- Mark as pending (grant_id will be filled in pass 2)
      v_grants := v_grants || jsonb_build_object(
        'url',        v_url,
        'grant_id',   NULL,
        'expires_at', NULL,
        'cached',     false,
        '_price',     v_price,
        '_publisher', v_debit->>'publisher_workspace_id',
        '_catalog',   v_debit->>'catalog_id',
        '_agent',     v_debit->>'agent_id',
        '_ttl',       (v_debit->>'ttl_minutes')::INTEGER
      );
    END IF;
  END LOOP;

  -- If everything is cached, return immediately
  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_balance
    FROM public.workspaces WHERE id = p_consumer_id;

    -- Strip internal fields from grants
    v_grants := (
      SELECT jsonb_agg(
        g - '_price' - '_publisher' - '_catalog' - '_agent' - '_ttl'
      )
      FROM jsonb_array_elements(v_grants) AS g
    );

    RETURN jsonb_build_object(
      'success',     true,
      'new_balance', v_balance,
      'grants',      v_grants
    );
  END IF;

  -- ----------------------------------------------------------------
  -- PASS 2: Lock balance, verify, debit, create grants
  -- ----------------------------------------------------------------

  -- Lock consumer workspace row
  SELECT balance_eur INTO v_balance
  FROM public.workspaces
  WHERE id = p_consumer_id
  FOR UPDATE;

  -- Check sufficient balance for ALL new grants
  IF v_balance < v_total_cost THEN
    RETURN jsonb_build_object(
      'success',  false,
      'reason',   'insufficient_balance',
      'balance',  v_balance,
      'required', v_total_cost
    );
  END IF;

  -- Debit total
  v_new_balance := v_balance - v_total_cost;
  UPDATE public.workspaces
  SET balance_eur = v_new_balance, updated_at = now()
  WHERE id = p_consumer_id;

  -- Process each non-cached grant
  FOR v_debit IN SELECT * FROM jsonb_array_elements(v_grants)
  LOOP
    -- Skip cached grants
    IF (v_debit->>'cached')::BOOLEAN THEN
      CONTINUE;
    END IF;

    v_url          := v_debit->>'url';
    v_price        := (v_debit->>'_price')::NUMERIC;
    v_publisher_id := (v_debit->>'_publisher')::UUID;
    v_catalog_id   := (v_debit->>'_catalog')::UUID;
    v_agent_id     := (v_debit->>'_agent')::UUID;
    v_ttl          := (v_debit->>'_ttl')::INTEGER;
    v_expires_at   := now() + (v_ttl || ' minutes')::INTERVAL;

    -- Create/update access grant
    INSERT INTO public.access_grants (
      consumer_workspace_id, publisher_workspace_id,
      url, catalog_id, agent_id, price_eur, expires_at
    ) VALUES (
      p_consumer_id, v_publisher_id,
      v_url, v_catalog_id, v_agent_id, v_price, v_expires_at
    )
    ON CONFLICT (consumer_workspace_id, url) DO UPDATE
      SET expires_at = v_expires_at,
          agent_id   = v_agent_id,
          catalog_id = v_catalog_id,
          price_eur  = v_price
    RETURNING id INTO v_grant_id;

    -- Record credit transaction
    INSERT INTO public.credit_transactions (
      consumer_workspace_id, publisher_workspace_id,
      type, amount_eur, content_url, catalog_id, grant_id, description
    ) VALUES (
      p_consumer_id, v_publisher_id,
      'debit', -v_price, v_url, v_catalog_id, v_grant_id,
      'SDK transaction grant'
    );
  END LOOP;

  -- Rebuild grants array with final grant_id/expires_at, strip internal fields
  v_grants := (
    SELECT jsonb_agg(
      CASE
        WHEN (g->>'cached')::BOOLEAN THEN
          g - '_price' - '_publisher' - '_catalog' - '_agent' - '_ttl'
        ELSE
          jsonb_build_object(
            'url',        g->>'url',
            'grant_id',   (
              SELECT id FROM public.access_grants
              WHERE consumer_workspace_id = p_consumer_id AND url = g->>'url'
            ),
            'expires_at', (
              SELECT expires_at FROM public.access_grants
              WHERE consumer_workspace_id = p_consumer_id AND url = g->>'url'
            ),
            'cached',     false
          )
      END
    )
    FROM jsonb_array_elements(v_grants) AS g
  );

  RETURN jsonb_build_object(
    'success',     true,
    'new_balance', v_new_balance,
    'grants',      v_grants
  );
END;
$$;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.check_cache_and_debit_batch(UUID, JSONB);
