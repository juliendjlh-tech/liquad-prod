-- ============================================================================
-- Migration 021: Token bot-binding, catalog TTL, RPC consolidation
--
-- 1. Add ttl_minutes to catalogs (publisher controls token validity)
-- 2. Add ua_pattern to access_grants (traceability: which bot was authorized)
-- 3. Consolidate 3 RPCs into 1: authorize_and_debit_batch
--    - Replaces check_cache_and_debit (single, dead)
--    - Replaces check_cache_and_debit_batch (consumer)
--    - Replaces check_balance_and_debit_batch (RAG)
-- 4. Drop dead RPCs
-- ============================================================================

-- 1. Catalog TTL (nullable — app falls back to 60 if NULL)
ALTER TABLE public.catalogs
  ADD COLUMN IF NOT EXISTS ttl_minutes INTEGER;

-- 2. Bot identity on grants
ALTER TABLE public.access_grants
  ADD COLUMN IF NOT EXISTS ua_pattern TEXT;

-- 3. Consolidated RPC: cache-aware, grant-creating, bot-specific
--
-- Serves both consumer (token purchase) and RAG (query billing) flows.
-- For each URL/source:
--   - If a valid (non-expired) grant exists → reuse it (free, cached)
--   - Otherwise → debit + create new grant
-- All-or-nothing atomicity: insufficient balance = no debits at all.
--
-- Parameters:
--   p_consumer_id: UUID of the consumer workspace
--   p_debits: JSONB array of objects, each with:
--     - publisher_workspace_id (UUID)
--     - catalog_id (UUID)
--     - agent_id (UUID)
--     - ua_pattern (TEXT)
--     - url (TEXT): normalized URL
--     - price_eur (NUMERIC)
--     - ttl_minutes (INTEGER)
--
-- Returns JSONB:
--   On success: { success: true, new_balance: number, grants: [...] }
--     Each grant: { url, grant_id, expires_at, cached }
--   On failure: { success: false, reason: "insufficient_balance",
--                 balance: number, required: number }

CREATE OR REPLACE FUNCTION public.authorize_and_debit_batch(
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
  v_ua_pattern    TEXT;
BEGIN
  -- ----------------------------------------------------------------
  -- PASS 1: Check cache for each URL, calculate total cost
  -- ----------------------------------------------------------------
  FOR v_debit IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_url   := v_debit->>'url';
    v_price := (v_debit->>'price_eur')::NUMERIC;

    SELECT * INTO v_cached_grant
    FROM public.access_grants
    WHERE consumer_workspace_id = p_consumer_id
      AND url = v_url
      AND expires_at > now()
    LIMIT 1;

    IF FOUND THEN
      v_grants := v_grants || jsonb_build_object(
        'url',        v_url,
        'grant_id',   v_cached_grant.id,
        'expires_at', v_cached_grant.expires_at,
        'cached',     true
      );
    ELSE
      v_total_cost := v_total_cost + v_price;
      v_grants := v_grants || jsonb_build_object(
        'url',          v_url,
        'grant_id',     NULL,
        'expires_at',   NULL,
        'cached',       false,
        '_price',       v_price,
        '_publisher',   v_debit->>'publisher_workspace_id',
        '_catalog',     v_debit->>'catalog_id',
        '_agent',       v_debit->>'agent_id',
        '_ua_pattern',  v_debit->>'ua_pattern',
        '_ttl',         (v_debit->>'ttl_minutes')::INTEGER
      );
    END IF;
  END LOOP;

  -- If everything is cached, return immediately
  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_balance
    FROM public.workspaces WHERE id = p_consumer_id;

    v_grants := (
      SELECT jsonb_agg(
        g - '_price' - '_publisher' - '_catalog' - '_agent' - '_ua_pattern' - '_ttl'
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
  SELECT balance_eur INTO v_balance
  FROM public.workspaces
  WHERE id = p_consumer_id
  FOR UPDATE;

  IF v_balance < v_total_cost THEN
    RETURN jsonb_build_object(
      'success',  false,
      'reason',   'insufficient_balance',
      'balance',  v_balance,
      'required', v_total_cost
    );
  END IF;

  v_new_balance := v_balance - v_total_cost;
  UPDATE public.workspaces
  SET balance_eur = v_new_balance, updated_at = now()
  WHERE id = p_consumer_id;

  FOR v_debit IN SELECT * FROM jsonb_array_elements(v_grants)
  LOOP
    IF (v_debit->>'cached')::BOOLEAN THEN
      CONTINUE;
    END IF;

    v_url          := v_debit->>'url';
    v_price        := (v_debit->>'_price')::NUMERIC;
    v_publisher_id := (v_debit->>'_publisher')::UUID;
    v_catalog_id   := (v_debit->>'_catalog')::UUID;
    v_agent_id     := (v_debit->>'_agent')::UUID;
    v_ua_pattern   := v_debit->>'_ua_pattern';
    v_ttl          := (v_debit->>'_ttl')::INTEGER;
    v_expires_at   := now() + (v_ttl || ' minutes')::INTERVAL;

    INSERT INTO public.access_grants (
      consumer_workspace_id, publisher_workspace_id,
      url, catalog_id, agent_id, ua_pattern, price_eur, expires_at
    ) VALUES (
      p_consumer_id, v_publisher_id,
      v_url, v_catalog_id, v_agent_id, v_ua_pattern, v_price, v_expires_at
    )
    ON CONFLICT (consumer_workspace_id, url) DO UPDATE
      SET expires_at  = v_expires_at,
          agent_id    = v_agent_id,
          ua_pattern  = v_ua_pattern,
          catalog_id  = v_catalog_id,
          price_eur   = v_price
    RETURNING id INTO v_grant_id;

    INSERT INTO public.credit_transactions (
      consumer_workspace_id, publisher_workspace_id,
      type, amount_eur, content_url, catalog_id, grant_id, description
    ) VALUES (
      p_consumer_id, v_publisher_id,
      'debit', -v_price, v_url, v_catalog_id, v_grant_id,
      'Content access grant'
    );
  END LOOP;

  v_grants := (
    SELECT jsonb_agg(
      CASE
        WHEN (g->>'cached')::BOOLEAN THEN
          g - '_price' - '_publisher' - '_catalog' - '_agent' - '_ua_pattern' - '_ttl'
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

-- 4. Drop dead RPCs
DROP FUNCTION IF EXISTS public.check_cache_and_debit(UUID, UUID, TEXT, UUID, UUID, NUMERIC, INTEGER);
DROP FUNCTION IF EXISTS public.check_cache_and_debit_batch(UUID, JSONB);
DROP FUNCTION IF EXISTS public.check_balance_and_debit_batch(UUID, JSONB);


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE public.catalogs DROP COLUMN IF EXISTS ttl_minutes;
-- ALTER TABLE public.access_grants DROP COLUMN IF EXISTS ua_pattern;
-- DROP FUNCTION IF EXISTS public.authorize_and_debit_batch(UUID, JSONB);
-- Then re-apply migrations 005/018/020/015 to restore original RPCs
