-- ============================================================================
-- Migration 042: access_grants per api_key + credit_transactions revenue split
--                + authorize_and_debit_batch body rewrite
-- ============================================================================
--
-- access_grants:
--   - Sticky cache per (api_key_id, url) instead of (consumer_workspace_id, url).
--     Two API keys for the same consumer with different networks now have
--     independent caches and independent sticky catalog assignments.
--   - api_key_id is NOT NULL.
--
-- credit_transactions:
--   - Split a single debit into FOUR ledger rows linked by grant_id:
--       debit         (consumer wallet -1.00)
--       content_owner (recipient = catalogue's publisher,    +0.85)
--       sub_manager   (recipient = network's workspace,      +0.07)
--       platform_fee  (recipient NULL,                       +0.08)
--   - Ratios stay in TS (lib/constants/revenue.ts) and are passed pre-computed
--     in p_debits — the RPC just stores what it is given.
--
-- authorize_and_debit_batch (Option B-light):
--   - Same name, same signature — RAG pipeline (rag-query/steps/debit.ts) and
--     consumer.service.ts share the function.
--   - p_debits shape changes: bot_id + ua_pattern dropped (resolved from
--     api_keys.bot_id + bots.ua_pattern instead); three split amounts added.
--   - Internal: network membership check, cache keyed by api_key_id, 4 ledger
--     rows per debit.
--
-- ⚠️ access_grants is truncated. credit_transactions retains rows via the
--    type → role mapping below.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. access_grants — add api_key_id, repivot cache uniqueness
-- ============================================================================

TRUNCATE TABLE public.access_grants;

ALTER TABLE public.access_grants
  ADD COLUMN api_key_id UUID NOT NULL
    REFERENCES public.api_keys(id) ON DELETE CASCADE;

CREATE INDEX idx_access_grants_api_key ON public.access_grants(api_key_id);

DROP INDEX IF EXISTS public.idx_ag_consumer_url;

CREATE UNIQUE INDEX idx_access_grants_api_key_url
  ON public.access_grants(api_key_id, url);

COMMENT ON COLUMN public.access_grants.api_key_id IS
  'The API key that obtained this grant. Sticky cache scope — same (api_key, '
  'url) cannot have two concurrent grants. Different keys (even for the same '
  'consumer) maintain independent caches.';


-- ============================================================================
-- 2. credit_transactions — role enum + recipient_workspace_id + revenue split
-- ============================================================================

CREATE TYPE public.credit_transaction_role AS ENUM (
  'debit',
  'content_owner',
  'sub_manager',
  'platform_fee',
  'credit'        -- top-up / refund / initial credit
);

ALTER TABLE public.credit_transactions
  ADD COLUMN role public.credit_transaction_role NULL,
  ADD COLUMN recipient_workspace_id UUID NULL
    REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- Backfill from the legacy `type` column.
UPDATE public.credit_transactions
SET role = CASE
  WHEN type = 'debit'                                       THEN 'debit'::public.credit_transaction_role
  WHEN type IN ('initial_credit', 'refund', 'topup')        THEN 'credit'::public.credit_transaction_role
END;

-- Existing data was pre-split (1 row per debit). It cannot retroactively be
-- broken into 4 rows because we don't have grant_id-aware reconstruction. We
-- leave legacy rows with recipient_workspace_id NULL (use publisher_workspace_id
-- for historical reporting). New rows will populate recipient_workspace_id.

-- Drop legacy check constraint + type column.
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS ct_amount_sign,
  ALTER COLUMN role SET NOT NULL,
  DROP COLUMN type;

CREATE INDEX idx_ct_recipient_role
  ON public.credit_transactions(recipient_workspace_id, role, created_at DESC)
  WHERE recipient_workspace_id IS NOT NULL;

COMMENT ON COLUMN public.credit_transactions.role IS
  'debit: consumer wallet outflow. content_owner / sub_manager / platform_fee: '
  'attribution lines tied to the same grant_id (sum = 0 across the 4 rows). '
  'credit: legacy top-up / refund (single row).';

COMMENT ON COLUMN public.credit_transactions.recipient_workspace_id IS
  'For content_owner / sub_manager rows: the workspace the amount accrues to. '
  'NULL for debit and platform_fee (no tenant counterparty).';


-- ============================================================================
-- 3. authorize_and_debit_batch — body rewrite (signature unchanged)
-- ============================================================================
--
-- p_debits item shape (TS callers must conform):
--   {
--     publisher_workspace_id  uuid,
--     catalog_id              uuid,
--     url                     text,
--     price_eur               numeric,
--     ttl_minutes             integer,
--     amount_content_owner    numeric,
--     amount_sub_manager      numeric,
--     amount_platform_fee     numeric
--   }
--
-- bot_id and ua_pattern are NO LONGER part of p_debits. They are resolved from
-- api_keys.bot_id and bots.ua_pattern.
--
-- Revenue ratios are NOT computed here — they are passed pre-computed in
-- amount_* fields (single source of truth in TS constants).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.authorize_and_debit_batch(
  p_api_key_id UUID,
  p_debits     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_consumer_ws    UUID;
  v_subscription   UUID;
  v_network        UUID;
  v_bot            UUID;
  v_ua_pattern     TEXT;
  v_sub_manager_ws UUID;
  v_debit          JSONB;
  v_balance        NUMERIC;
  v_new_balance    NUMERIC;
  v_total_cost     NUMERIC := 0;
  v_grants         JSONB   := '[]'::JSONB;
  v_cached_grant   public.access_grants%ROWTYPE;
  v_grant_id       UUID;
  v_expires_at     TIMESTAMPTZ;
  v_url            TEXT;
  v_price          NUMERIC;
  v_ttl            INTEGER;
  v_publisher_id   UUID;
  v_catalog_id     UUID;
  v_amount_co      NUMERIC;
  v_amount_sm      NUMERIC;
  v_amount_pf      NUMERIC;
BEGIN
  -- ---------------------------------------------------------------
  -- Resolution: api_key → (workspace, subscription, network, bot, sub manager).
  -- bots.ua_pattern is joined once and shared by all grants of this batch.
  -- ---------------------------------------------------------------
  SELECT ak.workspace_id, ak.subscription_id, ak.network_id, ak.bot_id,
         b.ua_pattern,    n.workspace_id
    INTO v_consumer_ws,   v_subscription,   v_network,    v_bot,
         v_ua_pattern,    v_sub_manager_ws
  FROM public.api_keys ak
  JOIN public.networks n ON n.id      = ak.network_id
  JOIN public.bots     b ON b.id      = ak.bot_id
  WHERE ak.id = p_api_key_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'api_key_not_found: %', p_api_key_id;
  END IF;

  -- ---------------------------------------------------------------
  -- PASS 1: cache lookup + network membership + total cost.
  -- For each input debit:
  --   * if there is a non-expired grant for (api_key, url) → cache hit, no debit
  --   * else if the catalogue is not in the network as 'accepted' → skip silently
  --   * else accumulate to total_cost and stash internal fields for PASS 2
  -- ---------------------------------------------------------------
  FOR v_debit IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_url        := v_debit->>'url';
    v_catalog_id := (v_debit->>'catalog_id')::UUID;
    v_price      := (v_debit->>'price_eur')::NUMERIC;

    -- Cache check (sticky catalog assignment).
    SELECT * INTO v_cached_grant
    FROM public.access_grants
    WHERE api_key_id = p_api_key_id
      AND url        = v_url
      AND expires_at > now()
    LIMIT 1;

    IF FOUND THEN
      v_grants := v_grants || jsonb_build_object(
        'url',        v_url,
        'grant_id',   v_cached_grant.id,
        'expires_at', v_cached_grant.expires_at,
        'cached',     true
      );
      CONTINUE;
    END IF;

    -- Network membership check (closes the TOCTOU window from app-side resolution).
    IF NOT EXISTS (
      SELECT 1 FROM public.network_catalogs
      WHERE network_id = v_network
        AND catalog_id = v_catalog_id
        AND status     = 'accepted'
    ) THEN
      -- Catalogue is not (no longer) accepted in this network. Skip — caller
      -- will report this URL as not granted. No debit, no grant.
      CONTINUE;
    END IF;

    v_total_cost := v_total_cost + v_price;
    v_grants := v_grants || jsonb_build_object(
      'url',                  v_url,
      'grant_id',             NULL,
      'expires_at',           NULL,
      'cached',               false,
      '_price',               v_price,
      '_publisher',           v_debit->>'publisher_workspace_id',
      '_catalog',             v_catalog_id::TEXT,
      '_ttl',                 (v_debit->>'ttl_minutes')::INTEGER,
      '_amount_content',      (v_debit->>'amount_content_owner')::NUMERIC,
      '_amount_sub_manager',  (v_debit->>'amount_sub_manager')::NUMERIC,
      '_amount_platform',     (v_debit->>'amount_platform_fee')::NUMERIC
    );
  END LOOP;

  -- ---------------------------------------------------------------
  -- Everything cached or filtered → no debit needed, just return balance.
  -- ---------------------------------------------------------------
  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_balance
    FROM public.subscriptions WHERE id = v_subscription;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'subscription_not_found: subscription=%', v_subscription;
    END IF;

    v_grants := (
      SELECT COALESCE(jsonb_agg(
        g - '_price' - '_publisher' - '_catalog' - '_ttl'
          - '_amount_content' - '_amount_sub_manager' - '_amount_platform'
      ), '[]'::JSONB)
      FROM jsonb_array_elements(v_grants) AS g
    );

    RETURN jsonb_build_object(
      'success',     true,
      'new_balance', v_balance,
      'grants',      v_grants
    );
  END IF;

  -- ---------------------------------------------------------------
  -- PASS 2: lock subscription, balance check, debit, write grants + ledger.
  -- ---------------------------------------------------------------
  SELECT balance_eur INTO v_balance
  FROM public.subscriptions
  WHERE id = v_subscription
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found: subscription=%', v_subscription;
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
  UPDATE public.subscriptions
    SET balance_eur = v_new_balance
  WHERE id = v_subscription;

  -- Iterate the grants accumulator: cached entries are no-ops, fresh entries
  -- create access_grants + 4 credit_transactions rows.
  FOR v_debit IN SELECT * FROM jsonb_array_elements(v_grants)
  LOOP
    IF (v_debit->>'cached')::BOOLEAN THEN CONTINUE; END IF;

    v_url          := v_debit->>'url';
    v_price        := (v_debit->>'_price')::NUMERIC;
    v_publisher_id := (v_debit->>'_publisher')::UUID;
    v_catalog_id   := (v_debit->>'_catalog')::UUID;
    v_ttl          := (v_debit->>'_ttl')::INTEGER;
    v_amount_co    := (v_debit->>'_amount_content')::NUMERIC;
    v_amount_sm    := (v_debit->>'_amount_sub_manager')::NUMERIC;
    v_amount_pf    := (v_debit->>'_amount_platform')::NUMERIC;
    v_expires_at   := now() + (v_ttl || ' minutes')::INTERVAL;

    INSERT INTO public.access_grants (
      consumer_workspace_id, publisher_workspace_id, api_key_id,
      url, catalog_id, bot_id, ua_pattern, price_eur, expires_at
    ) VALUES (
      v_consumer_ws, v_publisher_id, p_api_key_id,
      v_url, v_catalog_id, v_bot, v_ua_pattern, v_price, v_expires_at
    )
    ON CONFLICT (api_key_id, url) DO UPDATE
      SET expires_at = EXCLUDED.expires_at,
          catalog_id = EXCLUDED.catalog_id,
          bot_id     = EXCLUDED.bot_id,
          ua_pattern = EXCLUDED.ua_pattern,
          price_eur  = EXCLUDED.price_eur
    RETURNING id INTO v_grant_id;

    -- 4 ledger rows per grant. Sum is 0: -price + content + sub_manager + platform.
    INSERT INTO public.credit_transactions
      (consumer_workspace_id, recipient_workspace_id, publisher_workspace_id,
       role, amount_eur,
       content_url, catalog_id, grant_id, bot_id, subscription_id, api_key_id, description)
    VALUES
      -- 1. consumer wallet outflow
      (v_consumer_ws, NULL,            v_publisher_id,
       'debit', -v_price,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Content access grant'),
      -- 2. accrual: content owner (catalogue's publisher)
      (v_consumer_ws, v_publisher_id,  v_publisher_id,
       'content_owner', v_amount_co,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Content owner share'),
      -- 3. accrual: subscription manager (network's workspace)
      (v_consumer_ws, v_sub_manager_ws, v_publisher_id,
       'sub_manager', v_amount_sm,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Subscription manager share'),
      -- 4. accrual: platform (no tenant counterparty)
      (v_consumer_ws, NULL,            v_publisher_id,
       'platform_fee', v_amount_pf,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Platform fee');
  END LOOP;

  -- Build the public response: strip all internal `_*` fields and inline grant id / expiry.
  v_grants := (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN (g->>'cached')::BOOLEAN THEN
          g - '_price' - '_publisher' - '_catalog' - '_ttl'
            - '_amount_content' - '_amount_sub_manager' - '_amount_platform'
        ELSE
          jsonb_build_object(
            'url',        g->>'url',
            'grant_id',   (SELECT id         FROM public.access_grants
                            WHERE api_key_id = p_api_key_id AND url = g->>'url'),
            'expires_at', (SELECT expires_at FROM public.access_grants
                            WHERE api_key_id = p_api_key_id AND url = g->>'url'),
            'cached',     false
          )
      END
    ), '[]'::JSONB)
    FROM jsonb_array_elements(v_grants) AS g
  );

  RETURN jsonb_build_object(
    'success',     true,
    'new_balance', v_new_balance,
    'grants',      v_grants
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.authorize_and_debit_batch(UUID, JSONB) TO authenticated;


COMMIT;


-- ============================================================================
-- ROLLBACK (manual — irreversible TRUNCATE of access_grants)
-- ============================================================================
-- BEGIN;
--   -- RPC: see migration 032 for the previous body. Re-CREATE OR REPLACE.
--   ALTER TABLE public.credit_transactions
--     ADD COLUMN type TEXT;
--   UPDATE public.credit_transactions
--     SET type = CASE
--       WHEN role = 'debit'  THEN 'debit'
--       WHEN role = 'credit' THEN 'topup'
--       ELSE NULL
--     END;
--   ALTER TABLE public.credit_transactions
--     ALTER COLUMN type SET NOT NULL,
--     ADD CONSTRAINT ct_amount_sign CHECK (
--       (type = 'debit' AND amount_eur < 0)
--       OR (type IN ('initial_credit','refund','topup') AND amount_eur > 0)
--     ),
--     DROP COLUMN recipient_workspace_id,
--     DROP COLUMN role;
--   DROP TYPE IF EXISTS public.credit_transaction_role;
--   DROP INDEX IF EXISTS public.idx_ct_recipient_role;
--   DROP INDEX IF EXISTS public.idx_access_grants_api_key_url;
--   DROP INDEX IF EXISTS public.idx_access_grants_api_key;
--   ALTER TABLE public.access_grants DROP COLUMN api_key_id;
--   CREATE UNIQUE INDEX idx_ag_consumer_url
--     ON public.access_grants(consumer_workspace_id, url);
-- COMMIT;
