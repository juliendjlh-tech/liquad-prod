-- ============================================================================
-- Migration 023: Balance per API key
--
-- Moves balance_eur from workspaces to api_keys.
-- Each consumer key carries its own independent balance, rechargeable
-- independently. Debits now lock and decrement api_keys.balance_eur.
--
-- Changes:
--   1. api_keys:            add balance_eur
--   2. credit_transactions: add api_key_id
--   3. workspaces:          remove balance_eur (nothing in production)
--   4. authorize_and_debit_batch(): p_consumer_id → p_api_key_id
-- ============================================================================


-- 1. Add balance_eur to api_keys --------------------------------------------

ALTER TABLE public.api_keys
  ADD COLUMN balance_eur NUMERIC(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_balance_non_negative CHECK (balance_eur >= 0);


-- 2. Add api_key_id to credit_transactions ----------------------------------

ALTER TABLE public.credit_transactions
  ADD COLUMN api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL;

CREATE INDEX idx_ct_api_key ON public.credit_transactions(api_key_id);


-- 3. Remove balance_eur from workspaces -------------------------------------

ALTER TABLE public.workspaces DROP COLUMN balance_eur;


-- 4. Replace authorize_and_debit_batch() ------------------------------------
--
-- New signature: p_api_key_id replaces p_consumer_id.
-- The function resolves consumer_workspace_id internally via a JOIN on api_keys,
-- preserving all FK references in credit_transactions and access_grants.
--
-- Lock is now on api_keys row (not workspaces) for serialised concurrent debits.
-- All-or-nothing atomicity is preserved.

DROP FUNCTION IF EXISTS public.authorize_and_debit_batch(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.authorize_and_debit_batch(
  p_api_key_id UUID,
  p_debits     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_consumer_id  UUID;
  v_debit        JSONB;
  v_balance      NUMERIC;
  v_new_balance  NUMERIC;
  v_total_cost   NUMERIC := 0;
  v_grants       JSONB   := '[]'::JSONB;
  v_cached_grant public.access_grants%ROWTYPE;
  v_grant_id     UUID;
  v_expires_at   TIMESTAMPTZ;
  v_url          TEXT;
  v_price        NUMERIC;
  v_ttl          INTEGER;
  v_publisher_id UUID;
  v_catalog_id   UUID;
  v_agent_id     UUID;
  v_ua_pattern   TEXT;
BEGIN
  -- Resolve consumer workspace from the API key
  SELECT workspace_id INTO v_consumer_id
  FROM public.api_keys
  WHERE id = p_api_key_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'api_key_not_found: %', p_api_key_id;
  END IF;

  -- ----------------------------------------------------------------
  -- PASS 1: Check cache for each URL, calculate total cost
  -- ----------------------------------------------------------------
  FOR v_debit IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_url   := v_debit->>'url';
    v_price := (v_debit->>'price_eur')::NUMERIC;

    SELECT * INTO v_cached_grant
    FROM public.access_grants
    WHERE consumer_workspace_id = v_consumer_id
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
        'url',         v_url,
        'grant_id',    NULL,
        'expires_at',  NULL,
        'cached',      false,
        '_price',      v_price,
        '_publisher',  v_debit->>'publisher_workspace_id',
        '_catalog',    v_debit->>'catalog_id',
        '_agent',      v_debit->>'agent_id',
        '_ua_pattern', v_debit->>'ua_pattern',
        '_ttl',        (v_debit->>'ttl_minutes')::INTEGER
      );
    END IF;
  END LOOP;

  -- If everything is cached, return immediately (no debit needed)
  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_balance
    FROM public.api_keys WHERE id = p_api_key_id;

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
  -- PASS 2: Lock api_key balance, verify, debit, create grants
  -- ----------------------------------------------------------------
  SELECT balance_eur INTO v_balance
  FROM public.api_keys
  WHERE id = p_api_key_id
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
  UPDATE public.api_keys
  SET balance_eur = v_new_balance
  WHERE id = p_api_key_id;

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
      v_consumer_id, v_publisher_id,
      v_url, v_catalog_id, v_agent_id, v_ua_pattern, v_price, v_expires_at
    )
    ON CONFLICT (consumer_workspace_id, url) DO UPDATE
      SET expires_at = v_expires_at,
          agent_id   = v_agent_id,
          ua_pattern = v_ua_pattern,
          catalog_id = v_catalog_id,
          price_eur  = v_price
    RETURNING id INTO v_grant_id;

    INSERT INTO public.credit_transactions (
      consumer_workspace_id, publisher_workspace_id,
      type, amount_eur, content_url, catalog_id, grant_id, api_key_id, description
    ) VALUES (
      v_consumer_id, v_publisher_id,
      'debit', -v_price, v_url, v_catalog_id, v_grant_id, p_api_key_id,
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
              WHERE consumer_workspace_id = v_consumer_id AND url = g->>'url'
            ),
            'expires_at', (
              SELECT expires_at FROM public.access_grants
              WHERE consumer_workspace_id = v_consumer_id AND url = g->>'url'
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
-- ALTER TABLE public.api_keys DROP COLUMN balance_eur;
-- ALTER TABLE public.credit_transactions DROP COLUMN api_key_id;
-- DROP INDEX IF EXISTS idx_ct_api_key;
-- ALTER TABLE public.workspaces ADD COLUMN balance_eur NUMERIC(10,2) NOT NULL DEFAULT 0.00;
-- DROP FUNCTION IF EXISTS public.authorize_and_debit_batch(UUID, JSONB);
-- Then re-apply migration 021 to restore original RPC
