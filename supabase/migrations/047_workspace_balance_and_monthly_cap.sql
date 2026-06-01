-- ============================================================================
-- Migration 047: workspace-level balance + per-subscription monthly cap
-- ============================================================================
--
-- Balance pivot:
--   - Balance moves from subscriptions.balance_eur to workspaces.balance_eur.
--     A workspace has ONE wallet, shared across all its subscriptions and
--     api_keys. Stripe recharges the workspace wallet (handled in 048).
--
--   - Subscriptions become spending policies: each carries an optional
--     monthly_cap_eur (NULL = no cap, otherwise hard ceiling on debit per
--     calendar month UTC). The cap is enforced at the RPC level using a SUM
--     over credit_transactions (no cached counter — at MVP scale the partial
--     index makes this sub-millisecond).
--
-- Debit semantics:
--   - balance >= cost : the workspace balance can land at 0 exactly (unchanged
--     from previous behaviour). Strictly insufficient → 'insufficient_balance'.
--   - cap: month_spent + cost > cap → 'monthly_cap_exceeded'. Batch is
--     refused atomically — same all-or-nothing semantics as today.
--
-- RPC swap:
--   - credit_subscription is dropped (it was broken since 042 dropped the
--     `type` column — it was inserting onto a non-existent column). Replaced
--     by credit_workspace, which credits the workspace wallet and writes one
--     'credit' row in credit_transactions with optional subscription_id for
--     attribution.
--   - authorize_and_debit_batch keeps its signature and p_debits shape but
--     now locks workspaces FOR UPDATE, checks the monthly cap, and debits
--     the workspace balance.
--
-- Idempotency:
--   - credit_transactions.external_ref relied on a soft uniqueness check
--     inside the RPC. We promote it to a real UNIQUE index so concurrent
--     webhooks can never double-credit.
--
-- ⚠️ MVP: no production data. The balance backfill from subscriptions to
--   workspaces is a one-time computation that runs before the column is
--   dropped — safe to re-run because IF EXISTS guards the column.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. workspaces.balance_eur — the new single source of truth for funds
-- ============================================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS balance_eur NUMERIC(10,4) NOT NULL DEFAULT 0
    CHECK (balance_eur >= 0);

COMMENT ON COLUMN public.workspaces.balance_eur IS
  'Workspace wallet. Single source of funds, shared across all subscriptions '
  'and api_keys of this workspace. Topped up by Stripe (recurring + one-shot) '
  'or admin tools. Debited atomically by authorize_and_debit_batch.';


-- ============================================================================
-- 2. Backfill: aggregate the legacy per-subscription balances onto the workspace
-- ============================================================================

UPDATE public.workspaces ws
SET balance_eur = COALESCE((
  SELECT SUM(s.balance_eur)
  FROM public.subscriptions s
  WHERE s.workspace_id  = ws.id
    AND s.archived_at IS NULL
), 0)
WHERE EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'subscriptions'
    AND column_name  = 'balance_eur'
);


-- ============================================================================
-- 3. subscriptions: add monthly_cap_eur, drop legacy balance_eur
-- ============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS monthly_cap_eur NUMERIC(10,4) NULL
    CHECK (monthly_cap_eur IS NULL OR monthly_cap_eur >= 0);

ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS balance_eur;

COMMENT ON COLUMN public.subscriptions.monthly_cap_eur IS
  'Optional monthly spending ceiling for this subscription. NULL means no '
  'cap. Enforced by authorize_and_debit_batch as: SUM(-debit) since '
  'date_trunc(''month'', now() AT TIME ZONE ''UTC'') + total_cost > cap '
  '→ batch refused with reason=monthly_cap_exceeded. Resets at 00:00 UTC '
  'on the 1st of each month.';


-- ============================================================================
-- 4. Indexes
-- ============================================================================

-- Powers the per-month SUM in authorize_and_debit_batch.
CREATE INDEX IF NOT EXISTS idx_ct_sub_month
  ON public.credit_transactions (subscription_id, created_at DESC)
  WHERE role = 'debit';

-- Hard idempotency guarantee for Stripe webhooks. Was previously enforced only
-- by a soft check inside credit_subscription — promote to a true UNIQUE index
-- so concurrent webhooks (or a Stripe retry colliding with a manual replay)
-- cannot double-credit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ct_external_ref
  ON public.credit_transactions (external_ref)
  WHERE external_ref IS NOT NULL;


-- ============================================================================
-- 5. Drop the broken credit_subscription RPC
-- ============================================================================
-- This RPC was patched in migration 035 to use type='topup', but migration
-- 042 then dropped the `type` column entirely. Any call has been failing
-- since 042 (silently — there are no callers in the live admin UI). Drop it
-- and replace with credit_workspace below.

DROP FUNCTION IF EXISTS public.credit_subscription(UUID, NUMERIC, TEXT, TEXT);


-- ============================================================================
-- 6. credit_workspace RPC
-- ============================================================================
-- Credits the workspace wallet. Optional subscription_id is recorded on the
-- ledger row for attribution but does not affect routing (the wallet is at
-- the workspace level). external_ref is the Stripe object id (or admin tool
-- key) — UNIQUE index makes the insert idempotent at the DB level; the
-- short-circuit below makes that a graceful return instead of a 23505 error.

CREATE OR REPLACE FUNCTION public.credit_workspace(
  p_workspace_id    UUID,
  p_amount_eur      NUMERIC,
  p_external_ref    TEXT  DEFAULT NULL,
  p_description     TEXT  DEFAULT NULL,
  p_subscription_id UUID  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
  v_tx_id       UUID;
BEGIN
  IF p_amount_eur IS NULL OR p_amount_eur <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: %', p_amount_eur
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency short-circuit: if external_ref was already credited, return
  -- the existing transaction without touching the balance.
  IF p_external_ref IS NOT NULL THEN
    SELECT id INTO v_tx_id
    FROM public.credit_transactions
    WHERE external_ref = p_external_ref;

    IF FOUND THEN
      SELECT balance_eur INTO v_new_balance
      FROM public.workspaces WHERE id = p_workspace_id;

      RETURN jsonb_build_object(
        'success',        true,
        'idempotent_hit', true,
        'transaction_id', v_tx_id,
        'new_balance',    v_new_balance
      );
    END IF;
  END IF;

  UPDATE public.workspaces
  SET balance_eur = balance_eur + p_amount_eur
  WHERE id = p_workspace_id
  RETURNING balance_eur INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace_not_found: %', p_workspace_id;
  END IF;

  INSERT INTO public.credit_transactions (
    consumer_workspace_id, recipient_workspace_id, publisher_workspace_id,
    role, amount_eur,
    subscription_id, external_ref, description
  ) VALUES (
    p_workspace_id, p_workspace_id, NULL,
    'credit', p_amount_eur,
    p_subscription_id, p_external_ref, p_description
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

GRANT EXECUTE ON FUNCTION public.credit_workspace(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.credit_workspace(UUID, NUMERIC, TEXT, TEXT, UUID) IS
  'Workspace wallet top-up. Idempotent via external_ref (Stripe object id or '
  'admin tool key). Records a credit ledger row with optional subscription_id '
  'for audit attribution. Returns idempotent_hit=true when external_ref was '
  'already used.';


-- ============================================================================
-- 7. authorize_and_debit_batch — body rewrite for workspace balance + cap
-- ============================================================================
--
-- Differences vs. migration 046:
--   * Resolves subscriptions.monthly_cap_eur in the initial join.
--   * PASS 2 locks workspaces FOR UPDATE (was subscriptions).
--   * Adds monthly cap check before the balance check. Same all-or-nothing
--     semantics — refused batches return reason=monthly_cap_exceeded.
--   * Debits workspaces.balance_eur (was subscriptions.balance_eur).
--   * No-op branch (v_total_cost <= 0) reads workspaces.balance_eur.
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
  v_access_set     UUID;
  v_bot            UUID;
  v_ua_pattern     TEXT;
  v_max_price      NUMERIC;
  v_referral_ws    UUID;
  v_monthly_cap    NUMERIC;
  v_month_spent    NUMERIC;
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
  v_actual_price   NUMERIC;
  v_ttl            INTEGER;
  v_publisher_id   UUID;
  v_catalog_id     UUID;
  v_amount_co      NUMERIC;
  v_amount_sm      NUMERIC;
  v_amount_pf      NUMERIC;
BEGIN
  SELECT ak.workspace_id, ak.subscription_id, ak.access_settings_id, ak.bot_id,
         b.ua_pattern, as_t.max_price_eur, ws.referral_workspace_id,
         sub.monthly_cap_eur
    INTO v_consumer_ws, v_subscription, v_access_set, v_bot,
         v_ua_pattern, v_max_price, v_referral_ws,
         v_monthly_cap
  FROM public.api_keys        ak
  JOIN public.bots            b    ON b.id    = ak.bot_id
  JOIN public.access_settings as_t ON as_t.id = ak.access_settings_id
  JOIN public.workspaces      ws   ON ws.id   = ak.workspace_id
  JOIN public.subscriptions   sub  ON sub.id  = ak.subscription_id
  WHERE ak.id = p_api_key_id;

  IF v_consumer_ws IS NULL THEN
    RAISE EXCEPTION 'api_key_not_found: api_key=%', p_api_key_id;
  END IF;

  -- PASS 1: per-URL cache check + membership check + max_price guard.
  FOR v_debit IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_url        := v_debit->>'url';
    v_catalog_id := (v_debit->>'catalog_id')::UUID;

    SELECT * INTO v_cached_grant
    FROM public.access_grants
    WHERE api_key_id = p_api_key_id
      AND url        = v_url
      AND expires_at > now();

    IF FOUND THEN
      v_grants := v_grants || jsonb_build_object(
        'url',        v_url,
        'grant_id',   v_cached_grant.id,
        'expires_at', v_cached_grant.expires_at,
        'cached',     true
      );
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.access_settings_catalogs
      WHERE access_settings_id = v_access_set
        AND catalog_id         = v_catalog_id
    ) THEN
      CONTINUE;
    END IF;

    SELECT price_eur INTO v_actual_price
    FROM public.catalogs WHERE id = v_catalog_id;

    IF v_actual_price IS NULL OR (v_max_price IS NOT NULL AND v_actual_price > v_max_price) THEN
      CONTINUE;
    END IF;

    v_price := v_actual_price;
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

  -- Nothing to debit → return current workspace balance, strip internal fields.
  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_balance
    FROM public.workspaces WHERE id = v_consumer_ws;

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

  -- PASS 2: lock workspace, check cap, check balance, debit, write rows.
  SELECT balance_eur INTO v_balance
  FROM public.workspaces
  WHERE id = v_consumer_ws
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace_not_found: workspace=%', v_consumer_ws;
  END IF;

  -- Monthly cap (calendar month UTC). Cached grants do NOT count — they
  -- were already paid for in a previous batch.
  IF v_monthly_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(-amount_eur), 0) INTO v_month_spent
    FROM public.credit_transactions
    WHERE subscription_id = v_subscription
      AND role            = 'debit'
      AND created_at      >= date_trunc('month', now() AT TIME ZONE 'UTC');

    IF v_month_spent + v_total_cost > v_monthly_cap THEN
      RETURN jsonb_build_object(
        'success',  false,
        'reason',   'monthly_cap_exceeded',
        'cap',      v_monthly_cap,
        'spent',    v_month_spent,
        'required', v_total_cost
      );
    END IF;
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
  UPDATE public.workspaces
    SET balance_eur = v_new_balance
  WHERE id = v_consumer_ws;

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

    INSERT INTO public.credit_transactions
      (consumer_workspace_id, recipient_workspace_id, publisher_workspace_id,
       role, amount_eur,
       content_url, catalog_id, grant_id, bot_id, subscription_id, api_key_id, description)
    VALUES
      (v_consumer_ws, NULL,            v_publisher_id,
       'debit', -v_price,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Content access grant'),
      (v_consumer_ws, v_publisher_id,  v_publisher_id,
       'content_owner', v_amount_co,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Content owner share'),
      (v_consumer_ws, v_referral_ws,   v_publisher_id,
       'sub_manager', v_amount_sm,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Sub-manager share'),
      (v_consumer_ws, NULL,            v_publisher_id,
       'platform_fee', v_amount_pf,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Platform fee');
  END LOOP;

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
-- ROLLBACK (manual — destructive: balance pivot back to subscriptions)
-- ============================================================================
-- BEGIN;
--   -- Restore credit_subscription from migration 035 body.
--   -- Restore authorize_and_debit_batch from migration 046 body.
--   ALTER TABLE public.subscriptions
--     ADD COLUMN balance_eur NUMERIC(10,2) NOT NULL DEFAULT 0
--       CHECK (balance_eur >= 0);
--   -- Spread workspace balance back onto subscriptions: arbitrary policy —
--   -- pick any non-archived subscription per workspace and dump the balance.
--   -- (Lossy: per-sub allocation is not recoverable.)
--   ALTER TABLE public.subscriptions DROP COLUMN monthly_cap_eur;
--   ALTER TABLE public.workspaces    DROP COLUMN balance_eur;
--   DROP INDEX IF EXISTS public.idx_ct_external_ref;
--   DROP INDEX IF EXISTS public.idx_ct_sub_month;
--   DROP FUNCTION IF EXISTS public.credit_workspace(UUID, NUMERIC, TEXT, TEXT, UUID);
-- COMMIT;
-- ============================================================================
