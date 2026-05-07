-- ============================================================================
-- Migration 035: fix credit_subscription RPC type value
-- ============================================================================
--
-- The RPC introduced by migration 032 (and previously 029/025) inserts
-- credit_transactions rows with type = 'credit'. The table's CHECK constraint
-- (defined in migration 005) only allows ('debit', 'initial_credit', 'refund',
-- 'topup'). Any call to the RPC therefore failed silently with:
--
--   new row for relation "credit_transactions" violates check constraint
--   "credit_transactions_type_check"
--
-- The bug was dormant because the dashboard top-up UI was never exercised
-- end-to-end. We redefine the function to use 'topup', which is the correct
-- domain term for an admin-driven prepaid credit and is already accepted by
-- the existing CHECK constraint — no schema change required.
-- ============================================================================

BEGIN;

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

  -- 'topup' matches the credit_transactions_type_check constraint defined
  -- in migration 005 ('debit', 'initial_credit', 'refund', 'topup').
  INSERT INTO public.credit_transactions (
    consumer_workspace_id, publisher_workspace_id,
    type, amount_eur, subscription_id, api_key_id,
    external_ref, description
  ) VALUES (
    v_workspace_id, NULL,
    'topup', p_amount_eur, v_subscription_id, p_api_key_id,
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

COMMIT;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- The previous version (with type='credit') was broken at runtime — there is
-- no production data inserted by it that would conflict with this fix. Rolling
-- back simply means restoring the broken function from migration 032.
