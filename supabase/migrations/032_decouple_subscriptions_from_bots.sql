-- ============================================================================
-- Migration 032: Decouple subscriptions from bots
-- ============================================================================
--
-- Subscriptions used to be 1×bot×workspace (bot_subscriptions). With this
-- migration, a subscription is workspace-scoped only — bot identity moves
-- from the credential (api_keys.bot_id) to the call site (/licenses body).
--
-- Changes:
--   - Rename `bot_subscriptions` → `subscriptions`.
--   - Drop `subscriptions.bot_id` (and its FK to workspace_bots).
--   - Drop `api_keys.bot_id`.
--   - Replace partial UNIQUE(workspace_id, bot_id, external_user_id) with
--     UNIQUE(workspace_id, external_user_id) WHERE external_user_id IS NOT NULL.
--   - Rename FK columns: `*.bot_subscription_id` → `*.subscription_id`.
--   - `credit_transactions.bot_id` stays — sourced from /licenses request body
--     (validated against workspace_bots) so debits keep per-bot attribution.
--     For credits (top-ups), bot_id is NULL.
--   - RPCs rewritten:
--       * authorize_and_debit_batch: bot_id no longer comes from api_key;
--         taken from each debit row (already provided by caller).
--       * credit_bot_subscription → credit_subscription: drops bot_id resolution.
--
-- IMPORTANT: No production data exists. Safe to run as a single transaction.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. Drop functions and triggers that reference about-to-be-renamed columns.
--    plpgsql resolves names at call time, so renaming first then re-emitting
--    bodies avoids broken function bodies between the two states.
-- ============================================================================

DROP FUNCTION IF EXISTS public.authorize_and_debit_batch(UUID, JSONB);
DROP FUNCTION IF EXISTS public.credit_bot_subscription(UUID, NUMERIC, TEXT, TEXT);

DROP TRIGGER IF EXISTS trg_bot_subscriptions_prevent_delete_with_balance
  ON public.bot_subscriptions;
DROP FUNCTION IF EXISTS public.prevent_delete_bot_subscription_with_balance();


-- ============================================================================
-- 2. Drop coupling between subscriptions and bots.
-- ============================================================================

-- Composite FK to workspace_bots (added in migration 030)
ALTER TABLE public.bot_subscriptions
  DROP CONSTRAINT IF EXISTS bot_subscriptions_workspace_bot_fkey;

-- Single-column FK to bots
ALTER TABLE public.bot_subscriptions
  DROP CONSTRAINT IF EXISTS bot_subscriptions_bot_id_fkey;

-- Partial UNIQUE(workspace_id, bot_id, external_user_id)
DROP INDEX IF EXISTS bot_subscriptions_ws_bot_external_user_uidx;

ALTER TABLE public.bot_subscriptions DROP COLUMN bot_id;

-- api_keys.bot_id was a 1:1 mirror of bot_subscriptions.bot_id; gone with it.
ALTER TABLE public.api_keys
  DROP CONSTRAINT IF EXISTS api_keys_bot_id_fkey;
ALTER TABLE public.api_keys DROP COLUMN bot_id;


-- ============================================================================
-- 3. Rename table + FK columns.
-- ============================================================================

ALTER TABLE public.bot_subscriptions RENAME TO subscriptions;

ALTER TABLE public.api_keys
  RENAME COLUMN bot_subscription_id TO subscription_id;

ALTER TABLE public.credit_transactions
  RENAME COLUMN bot_subscription_id TO subscription_id;


-- ============================================================================
-- 4. Re-create the unique constraint without bot_id.
-- ============================================================================

CREATE UNIQUE INDEX subscriptions_ws_external_user_uidx
  ON public.subscriptions(workspace_id, external_user_id)
  WHERE external_user_id IS NOT NULL;


-- ============================================================================
-- 5. Rename indexes / constraints / RLS policies for consistency.
-- ============================================================================

ALTER INDEX IF EXISTS idx_bot_subscriptions_workspace
  RENAME TO idx_subscriptions_workspace;
DROP INDEX IF EXISTS idx_bot_subscriptions_workspace_bot;

ALTER INDEX IF EXISTS idx_api_keys_bot_subscription
  RENAME TO idx_api_keys_subscription;

ALTER INDEX IF EXISTS idx_ct_bot_subscription
  RENAME TO idx_ct_subscription;

ALTER TABLE public.subscriptions
  RENAME CONSTRAINT bot_subscriptions_balance_non_negative
  TO subscriptions_balance_non_negative;

ALTER POLICY "workspace_members_read_bot_subscriptions" ON public.subscriptions
  RENAME TO "workspace_members_read_subscriptions";
ALTER POLICY "workspace_admins_write_bot_subscriptions" ON public.subscriptions
  RENAME TO "workspace_admins_write_subscriptions";


-- ============================================================================
-- 6. Re-emit the delete guard with the new entity name.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_delete_subscription_with_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.balance_eur > 0 THEN
    RAISE EXCEPTION
      'subscription_has_balance: subscription=% balance=% — refund before deleting',
      OLD.id, OLD.balance_eur
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_subscriptions_prevent_delete_with_balance
  BEFORE DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_subscription_with_balance();


-- ============================================================================
-- 7. authorize_and_debit_batch — bot_id sourced from each debit row.
-- ============================================================================
--
-- The route handler validates that the caller's workspace owns `bot_id` (via
-- workspace_bots) before invoking this RPC. Each debit row carries its own
-- bot_id (per-call selection of which bot the consumer is acting as).

CREATE OR REPLACE FUNCTION public.authorize_and_debit_batch(
  p_api_key_id UUID,
  p_debits     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id    UUID;
  v_subscription_id UUID;
  v_debit           JSONB;
  v_balance         NUMERIC;
  v_new_balance     NUMERIC;
  v_total_cost      NUMERIC := 0;
  v_grants          JSONB   := '[]'::JSONB;
  v_cached_grant    public.access_grants%ROWTYPE;
  v_grant_id        UUID;
  v_expires_at      TIMESTAMPTZ;
  v_url             TEXT;
  v_price           NUMERIC;
  v_ttl             INTEGER;
  v_publisher_id    UUID;
  v_catalog_id      UUID;
  v_debit_bot       UUID;
  v_ua_pattern      TEXT;
BEGIN
  -- Resolve (workspace_id, subscription_id) from the API key.
  SELECT workspace_id, subscription_id
    INTO v_workspace_id, v_subscription_id
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
        '_bot',        v_debit->>'bot_id',
        '_ua_pattern', v_debit->>'ua_pattern',
        '_ttl',        (v_debit->>'ttl_minutes')::INTEGER
      );
    END IF;
  END LOOP;

  -- If everything is cached, return current balance immediately
  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_balance
    FROM public.subscriptions WHERE id = v_subscription_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'subscription_not_found: subscription=%', v_subscription_id;
    END IF;

    v_grants := (
      SELECT jsonb_agg(
        g - '_price' - '_publisher' - '_catalog' - '_bot' - '_ua_pattern' - '_ttl'
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
  -- PASS 2: Lock subscription, verify, debit, create grants
  -- ----------------------------------------------------------------
  SELECT balance_eur INTO v_balance
  FROM public.subscriptions
  WHERE id = v_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found: subscription=%', v_subscription_id;
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
  WHERE id = v_subscription_id;

  FOR v_debit IN SELECT * FROM jsonb_array_elements(v_grants)
  LOOP
    IF (v_debit->>'cached')::BOOLEAN THEN
      CONTINUE;
    END IF;

    v_url          := v_debit->>'url';
    v_price        := (v_debit->>'_price')::NUMERIC;
    v_publisher_id := (v_debit->>'_publisher')::UUID;
    v_catalog_id   := (v_debit->>'_catalog')::UUID;
    v_debit_bot    := (v_debit->>'_bot')::UUID;
    v_ua_pattern   := v_debit->>'_ua_pattern';
    v_ttl          := (v_debit->>'_ttl')::INTEGER;
    v_expires_at   := now() + (v_ttl || ' minutes')::INTERVAL;

    INSERT INTO public.access_grants (
      consumer_workspace_id, publisher_workspace_id,
      url, catalog_id, bot_id, ua_pattern, price_eur, expires_at
    ) VALUES (
      v_workspace_id, v_publisher_id,
      v_url, v_catalog_id, v_debit_bot, v_ua_pattern, v_price, v_expires_at
    )
    ON CONFLICT (consumer_workspace_id, url) DO UPDATE
      SET expires_at = v_expires_at,
          bot_id     = v_debit_bot,
          ua_pattern = v_ua_pattern,
          catalog_id = v_catalog_id,
          price_eur  = v_price
    RETURNING id INTO v_grant_id;

    INSERT INTO public.credit_transactions (
      consumer_workspace_id, publisher_workspace_id,
      type, amount_eur, content_url, catalog_id, grant_id,
      bot_id, subscription_id, api_key_id, description
    ) VALUES (
      v_workspace_id, v_publisher_id,
      'debit', -v_price, v_url, v_catalog_id, v_grant_id,
      v_debit_bot, v_subscription_id, p_api_key_id, 'Content access grant'
    );
  END LOOP;

  v_grants := (
    SELECT jsonb_agg(
      CASE
        WHEN (g->>'cached')::BOOLEAN THEN
          g - '_price' - '_publisher' - '_catalog' - '_bot' - '_ua_pattern' - '_ttl'
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
-- 8. credit_subscription — bot-agnostic top-up.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.credit_subscription(
  p_api_key_id   UUID,
  p_amount_eur   NUMERIC,
  p_external_ref TEXT DEFAULT NULL,
  p_description  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id    UUID;
  v_subscription_id UUID;
  v_revoked_at      TIMESTAMPTZ;
  v_new_balance     NUMERIC;
  v_tx_id           UUID;
BEGIN
  IF p_amount_eur IS NULL OR p_amount_eur <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: %', p_amount_eur
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT workspace_id, subscription_id, revoked_at
    INTO v_workspace_id, v_subscription_id, v_revoked_at
  FROM public.api_keys
  WHERE id = p_api_key_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'api_key_not_found: %', p_api_key_id;
  END IF;

  IF v_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'api_key_revoked: %', p_api_key_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency short-circuit
  IF p_external_ref IS NOT NULL THEN
    SELECT id INTO v_tx_id
    FROM public.credit_transactions
    WHERE external_ref = p_external_ref;

    IF FOUND THEN
      SELECT balance_eur INTO v_new_balance
      FROM public.subscriptions WHERE id = v_subscription_id;
      RETURN jsonb_build_object(
        'success',        true,
        'idempotent_hit', true,
        'transaction_id', v_tx_id,
        'new_balance',    v_new_balance
      );
    END IF;
  END IF;

  UPDATE public.subscriptions
  SET balance_eur = balance_eur + p_amount_eur
  WHERE id = v_subscription_id
  RETURNING balance_eur INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found: %', v_subscription_id;
  END IF;

  -- Credits are bot-agnostic (subscription is no longer bound to a bot).
  INSERT INTO public.credit_transactions (
    consumer_workspace_id, publisher_workspace_id,
    type, amount_eur, subscription_id, api_key_id,
    external_ref, description
  ) VALUES (
    v_workspace_id, NULL,
    'credit', p_amount_eur, v_subscription_id, p_api_key_id,
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
-- 9. Comments
-- ============================================================================

COMMENT ON TABLE public.subscriptions IS
  'Per-workspace prepaid balance. Bot-agnostic since migration 032 — the bot '
  'identity is provided per /licenses call and validated against workspace_bots.';

COMMENT ON COLUMN public.subscriptions.scope_to_workspace IS
  'When true (default), this subscription only sees catalogs owned by its '
  'workspace_id. End-user subscription mode (sold to partners). When false, '
  'the subscription accesses all matching network catalogs and the wallet is '
  'debited for paid content. Client subscription mode (workspace as end-user).';


COMMIT;


-- ============================================================================
-- ROLLBACK (manual — verify before running)
-- ============================================================================
-- BEGIN;
--   ALTER TABLE public.subscriptions RENAME TO bot_subscriptions;
--   ALTER TABLE public.api_keys RENAME COLUMN subscription_id TO bot_subscription_id;
--   ALTER TABLE public.credit_transactions RENAME COLUMN subscription_id TO bot_subscription_id;
--   ALTER TABLE public.bot_subscriptions ADD COLUMN bot_id UUID REFERENCES public.bots(id) ON DELETE RESTRICT;
--   ALTER TABLE public.api_keys ADD COLUMN bot_id UUID REFERENCES public.bots(id) ON DELETE RESTRICT;
--   -- (then re-apply migrations 025 + 029 + 030 + 031 to restore prior structure/RPCs)
-- COMMIT;
