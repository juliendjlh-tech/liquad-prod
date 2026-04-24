-- ============================================================================
-- Migration 024: Wallet on workspace_agents (decouple balance from api_keys)
--
-- Rationale: api_keys are credentials (rotatable, revokable). Balance is a
-- financial account that must survive credential rotations. workspace_agents
-- already has the right grain — one row per (workspace, bot) — so it becomes
-- the wallet. Multiple api_keys for the same bot share the same balance.
--
-- Changes:
--   1. workspace_agents:    add balance_eur
--   2. credit_transactions: add agent_id, drop api_key_id
--   3. api_keys:            drop balance_eur
--   4. Trigger: prevent deleting a workspace_agents row with balance > 0
--   5. authorize_and_debit_batch: lock/debit workspace_agents
-- ============================================================================


-- 1. Balance on workspace_agents --------------------------------------------

ALTER TABLE public.workspace_agents
  ADD COLUMN balance_eur NUMERIC(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.workspace_agents
  ADD CONSTRAINT workspace_agents_balance_non_negative CHECK (balance_eur >= 0);


-- 2. credit_transactions: agent_id replaces api_key_id ----------------------
--
-- Transactions are now tied to the bot (wallet identity), not to the specific
-- credential used. api_key_id was introduced in 023 but is no longer the right
-- audit axis now that the wallet is per-bot.

ALTER TABLE public.credit_transactions
  ADD COLUMN agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;

CREATE INDEX idx_ct_agent ON public.credit_transactions(agent_id);

DROP INDEX IF EXISTS idx_ct_api_key;
ALTER TABLE public.credit_transactions DROP COLUMN api_key_id;


-- 3. Drop balance_eur from api_keys -----------------------------------------

ALTER TABLE public.api_keys DROP COLUMN balance_eur;


-- 4. Safeguard: prevent deletion of a wallet with non-zero balance ----------

CREATE OR REPLACE FUNCTION public.prevent_delete_workspace_agent_with_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.balance_eur > 0 THEN
    RAISE EXCEPTION
      'workspace_agent_has_balance: workspace=% agent=% balance=% — refund before deactivating',
      OLD.workspace_id, OLD.agent_id, OLD.balance_eur
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_prevent_delete_with_balance ON public.workspace_agents;
CREATE TRIGGER trg_wa_prevent_delete_with_balance
  BEFORE DELETE ON public.workspace_agents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_workspace_agent_with_balance();


-- 5. Rewrite authorize_and_debit_batch --------------------------------------
--
-- Same public signature: p_api_key_id + p_debits.
-- Internally resolves (workspace_id, agent_id) from api_keys, then locks and
-- debits the corresponding workspace_agents row.

DROP FUNCTION IF EXISTS public.authorize_and_debit_batch(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.authorize_and_debit_batch(
  p_api_key_id UUID,
  p_debits     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id UUID;
  v_agent_id     UUID;
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
  v_debit_agent  UUID;
  v_ua_pattern   TEXT;
BEGIN
  -- Resolve (workspace_id, agent_id) from the API key
  SELECT workspace_id, agent_id INTO v_workspace_id, v_agent_id
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
    WHERE consumer_workspace_id = v_workspace_id
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

  -- If everything is cached, return current wallet balance immediately
  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_balance
    FROM public.workspace_agents
    WHERE workspace_id = v_workspace_id AND agent_id = v_agent_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'wallet_not_found: workspace=% agent=%', v_workspace_id, v_agent_id;
    END IF;

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
  -- PASS 2: Lock wallet, verify, debit, create grants
  -- ----------------------------------------------------------------
  SELECT balance_eur INTO v_balance
  FROM public.workspace_agents
  WHERE workspace_id = v_workspace_id AND agent_id = v_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found: workspace=% agent=%', v_workspace_id, v_agent_id;
  END IF;

  IF v_balance < v_total_cost THEN
    RETURN jsonb_build_object(
      'success',  false,
      'reason',   'insufficient_balance',
      'balance',  v_balance,
      'required', v_total_cost
    );
  END IF;

  v_new_balance := v_balance - v_total_cost;
  UPDATE public.workspace_agents
  SET balance_eur = v_new_balance
  WHERE workspace_id = v_workspace_id AND agent_id = v_agent_id;

  FOR v_debit IN SELECT * FROM jsonb_array_elements(v_grants)
  LOOP
    IF (v_debit->>'cached')::BOOLEAN THEN
      CONTINUE;
    END IF;

    v_url          := v_debit->>'url';
    v_price        := (v_debit->>'_price')::NUMERIC;
    v_publisher_id := (v_debit->>'_publisher')::UUID;
    v_catalog_id   := (v_debit->>'_catalog')::UUID;
    v_debit_agent  := (v_debit->>'_agent')::UUID;
    v_ua_pattern   := v_debit->>'_ua_pattern';
    v_ttl          := (v_debit->>'_ttl')::INTEGER;
    v_expires_at   := now() + (v_ttl || ' minutes')::INTERVAL;

    INSERT INTO public.access_grants (
      consumer_workspace_id, publisher_workspace_id,
      url, catalog_id, agent_id, ua_pattern, price_eur, expires_at
    ) VALUES (
      v_workspace_id, v_publisher_id,
      v_url, v_catalog_id, v_debit_agent, v_ua_pattern, v_price, v_expires_at
    )
    ON CONFLICT (consumer_workspace_id, url) DO UPDATE
      SET expires_at = v_expires_at,
          agent_id   = v_debit_agent,
          ua_pattern = v_ua_pattern,
          catalog_id = v_catalog_id,
          price_eur  = v_price
    RETURNING id INTO v_grant_id;

    INSERT INTO public.credit_transactions (
      consumer_workspace_id, publisher_workspace_id,
      type, amount_eur, content_url, catalog_id, grant_id, agent_id, description
    ) VALUES (
      v_workspace_id, v_publisher_id,
      'debit', -v_price, v_url, v_catalog_id, v_grant_id, v_agent_id,
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
              WHERE consumer_workspace_id = v_workspace_id AND url = g->>'url'
            ),
            'expires_at', (
              SELECT expires_at FROM public.access_grants
              WHERE consumer_workspace_id = v_workspace_id AND url = g->>'url'
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
-- DROP TRIGGER IF EXISTS trg_wa_prevent_delete_with_balance ON public.workspace_agents;
-- DROP FUNCTION IF EXISTS public.prevent_delete_workspace_agent_with_balance();
-- ALTER TABLE public.workspace_agents DROP COLUMN balance_eur;
-- ALTER TABLE public.credit_transactions DROP COLUMN agent_id;
-- ALTER TABLE public.credit_transactions ADD COLUMN api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL;
-- CREATE INDEX idx_ct_api_key ON public.credit_transactions(api_key_id);
-- ALTER TABLE public.api_keys ADD COLUMN balance_eur NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (balance_eur >= 0);
-- DROP FUNCTION IF EXISTS public.authorize_and_debit_batch(UUID, JSONB);
-- Then re-apply migration 023 to restore the previous RPC
