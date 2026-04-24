-- ============================================================================
-- Migration 025: Wallets entity (multi-tenant budgets per bot)
--
-- Introduces `wallets` as an entity between workspace_agents (a workspace
-- operating a bot) and api_keys (credentials used by its end-users).
--
-- Why: the ChatGPT-style use case (one API key per end-user of the consumer,
-- each with its own budget) cannot be expressed by 024's single wallet per
-- (workspace, agent). The wallet must be rotatable-key-friendly (survives key
-- revocation), and multiple wallets must be possible on the same (workspace,
-- agent) pair.
--
-- Design:
--   - wallets(id, workspace_id, agent_id, external_user_id, label, balance_eur, ...)
--     * UNIQUE(workspace_id, agent_id, external_user_id) WHERE external_user_id IS NOT NULL
--   - api_keys gains wallet_id (NOT NULL, FK RESTRICT) — credentials point to a wallet.
--   - credit_transactions gains wallet_id + api_key_id (audit trail).
--     publisher_workspace_id relaxed to NULL (credits have no publisher).
--   - workspace_agents loses balance_eur (+ its guard trigger).
--   - RPC authorize_and_debit_batch rewritten: resolves wallet_id from api_key,
--     locks/debits wallets.balance_eur.
--   - New RPC credit_wallet for top-ups (idempotent via external_ref).
-- ============================================================================


-- 1. TABLE wallets ----------------------------------------------------------

CREATE TABLE public.wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  external_user_id TEXT,
  label TEXT,
  balance_eur NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT wallets_balance_non_negative CHECK (balance_eur >= 0),
  -- Guarantee the wallet's (workspace, agent) pair matches a subscribed bot.
  -- workspace_agents has composite PK (workspace_id, agent_id).
  CONSTRAINT wallets_workspace_agent_fkey
    FOREIGN KEY (workspace_id, agent_id)
    REFERENCES public.workspace_agents(workspace_id, agent_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_wallets_workspace ON public.wallets(workspace_id);
CREATE INDEX idx_wallets_workspace_agent ON public.wallets(workspace_id, agent_id);

-- When external_user_id is provided, it must be unique within (workspace, agent)
-- to prevent duplicate wallets for the same end-user. NULL is allowed freely.
CREATE UNIQUE INDEX wallets_ws_agent_external_user_uidx
  ON public.wallets(workspace_id, agent_id, external_user_id)
  WHERE external_user_id IS NOT NULL;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_wallets" ON public.wallets
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "workspace_admins_write_wallets" ON public.wallets
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );


-- 2. Backfill: one wallet per existing workspace_agents row -----------------
-- Reuses the current balance_eur value so debit history stays consistent.

INSERT INTO public.wallets (workspace_id, agent_id, label, balance_eur)
SELECT workspace_id, agent_id, 'default', balance_eur
FROM public.workspace_agents;


-- 3. api_keys: add wallet_id ------------------------------------------------

ALTER TABLE public.api_keys
  ADD COLUMN wallet_id UUID REFERENCES public.wallets(id) ON DELETE RESTRICT;

-- Link every existing api_key to the default wallet of its (workspace, agent).
UPDATE public.api_keys k
SET wallet_id = w.id
FROM public.wallets w
WHERE w.workspace_id = k.workspace_id
  AND w.agent_id = k.agent_id;

ALTER TABLE public.api_keys
  ALTER COLUMN wallet_id SET NOT NULL;

CREATE INDEX idx_api_keys_wallet ON public.api_keys(wallet_id);


-- 4. credit_transactions: add wallet_id + api_key_id, relax publisher -------

ALTER TABLE public.credit_transactions
  ADD COLUMN wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  ADD COLUMN api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  ADD COLUMN external_ref TEXT;

-- Credits (top-ups) have no publisher. Make the column nullable and drop the
-- trivial CHECK if any old migration set one.
ALTER TABLE public.credit_transactions
  ALTER COLUMN publisher_workspace_id DROP NOT NULL;

-- Backfill wallet_id on existing debit rows using the (workspace, agent) pair.
UPDATE public.credit_transactions ct
SET wallet_id = w.id
FROM public.wallets w
WHERE w.workspace_id = ct.consumer_workspace_id
  AND w.agent_id = ct.agent_id
  AND ct.wallet_id IS NULL;

CREATE INDEX idx_ct_wallet ON public.credit_transactions(wallet_id);
CREATE INDEX idx_ct_api_key_topup ON public.credit_transactions(api_key_id)
  WHERE api_key_id IS NOT NULL;

-- Idempotency key for external credit flows (Stripe payment_intent_id, etc.).
-- Only enforced when set, so debits (which don't carry external_ref) are free.
CREATE UNIQUE INDEX ct_external_ref_uidx
  ON public.credit_transactions(external_ref)
  WHERE external_ref IS NOT NULL;


-- 5. workspace_agents: drop balance + its delete guard ----------------------

DROP TRIGGER IF EXISTS trg_wa_prevent_delete_with_balance ON public.workspace_agents;
DROP FUNCTION IF EXISTS public.prevent_delete_workspace_agent_with_balance();

ALTER TABLE public.workspace_agents DROP COLUMN balance_eur;


-- 6. New delete guard on wallets --------------------------------------------
-- Archiving a wallet is soft (set archived_at). Hard delete requires zero
-- balance — funds must be refunded or transferred out first.

CREATE OR REPLACE FUNCTION public.prevent_delete_wallet_with_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.balance_eur > 0 THEN
    RAISE EXCEPTION
      'wallet_has_balance: wallet=% balance=% — refund before deleting',
      OLD.id, OLD.balance_eur
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_wallets_prevent_delete_with_balance
  BEFORE DELETE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_wallet_with_balance();


-- 7. authorize_and_debit_batch: debit wallets instead of workspace_agents ---
--
-- Public signature unchanged (p_api_key_id, p_debits). Internally resolves
-- wallet_id via the api_key, locks and debits the wallet row. Records the
-- api_key_id in credit_transactions so every debit is attributable to the
-- credential that triggered it.

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
  v_wallet_id    UUID;
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
  -- Resolve (workspace_id, agent_id, wallet_id) from the API key.
  SELECT workspace_id, agent_id, wallet_id
    INTO v_workspace_id, v_agent_id, v_wallet_id
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
    FROM public.wallets WHERE id = v_wallet_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'wallet_not_found: wallet=%', v_wallet_id;
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
  FROM public.wallets
  WHERE id = v_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found: wallet=%', v_wallet_id;
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
  UPDATE public.wallets
  SET balance_eur = v_new_balance
  WHERE id = v_wallet_id;

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
      type, amount_eur, content_url, catalog_id, grant_id,
      agent_id, wallet_id, api_key_id, description
    ) VALUES (
      v_workspace_id, v_publisher_id,
      'debit', -v_price, v_url, v_catalog_id, v_grant_id,
      v_agent_id, v_wallet_id, p_api_key_id, 'Content access grant'
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


-- 8. credit_wallet: top-up via API key (idempotent) -------------------------
--
-- Resolves the wallet from an active api_key, locks it, adds the amount, and
-- writes a credit row. external_ref makes re-runs safe (Stripe webhook retries).

CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_api_key_id   UUID,
  p_amount_eur   NUMERIC,
  p_external_ref TEXT DEFAULT NULL,
  p_description  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id UUID;
  v_agent_id     UUID;
  v_wallet_id    UUID;
  v_revoked_at   TIMESTAMPTZ;
  v_new_balance  NUMERIC;
  v_tx_id        UUID;
BEGIN
  IF p_amount_eur IS NULL OR p_amount_eur <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: %', p_amount_eur
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT workspace_id, agent_id, wallet_id, revoked_at
    INTO v_workspace_id, v_agent_id, v_wallet_id, v_revoked_at
  FROM public.api_keys
  WHERE id = p_api_key_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'api_key_not_found: %', p_api_key_id;
  END IF;

  IF v_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'api_key_revoked: %', p_api_key_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency short-circuit: if the external_ref already landed, return the
  -- existing transaction state instead of double-crediting.
  IF p_external_ref IS NOT NULL THEN
    SELECT id INTO v_tx_id
    FROM public.credit_transactions
    WHERE external_ref = p_external_ref;

    IF FOUND THEN
      SELECT balance_eur INTO v_new_balance FROM public.wallets WHERE id = v_wallet_id;
      RETURN jsonb_build_object(
        'success',        true,
        'idempotent_hit', true,
        'transaction_id', v_tx_id,
        'new_balance',    v_new_balance
      );
    END IF;
  END IF;

  UPDATE public.wallets
  SET balance_eur = balance_eur + p_amount_eur
  WHERE id = v_wallet_id
  RETURNING balance_eur INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found: %', v_wallet_id;
  END IF;

  INSERT INTO public.credit_transactions (
    consumer_workspace_id, publisher_workspace_id,
    type, amount_eur, agent_id, wallet_id, api_key_id,
    external_ref, description
  ) VALUES (
    v_workspace_id, NULL,
    'credit', p_amount_eur, v_agent_id, v_wallet_id, p_api_key_id,
    p_external_ref, p_description
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success',        true,
    'idempotent_hit', false,
    'transaction_id', v_tx_id,
    'new_balance',    v_new_balance
  );
END;
$$;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.credit_wallet(UUID, NUMERIC, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.authorize_and_debit_batch(UUID, JSONB);
-- DROP TRIGGER IF EXISTS trg_wallets_prevent_delete_with_balance ON public.wallets;
-- DROP FUNCTION IF EXISTS public.prevent_delete_wallet_with_balance();
-- ALTER TABLE public.workspace_agents ADD COLUMN balance_eur NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (balance_eur >= 0);
-- UPDATE public.workspace_agents wa SET balance_eur = COALESCE(
--   (SELECT SUM(w.balance_eur) FROM public.wallets w
--    WHERE w.workspace_id = wa.workspace_id AND w.agent_id = wa.agent_id), 0);
-- DROP INDEX IF EXISTS ct_external_ref_uidx;
-- DROP INDEX IF EXISTS idx_ct_api_key_topup;
-- DROP INDEX IF EXISTS idx_ct_wallet;
-- ALTER TABLE public.credit_transactions
--   DROP COLUMN external_ref, DROP COLUMN api_key_id, DROP COLUMN wallet_id;
-- DROP INDEX IF EXISTS idx_api_keys_wallet;
-- ALTER TABLE public.api_keys DROP COLUMN wallet_id;
-- DROP TABLE IF EXISTS public.wallets;
-- Then re-apply migration 024 to restore trigger + RPC.
