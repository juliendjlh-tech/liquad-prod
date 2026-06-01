-- ============================================================================
-- Migration 048: Stripe billing — customer link + recurring subscription state
-- ============================================================================
--
-- workspaces.stripe_customer_id:
--   - Created lazily the first time a workspace starts a Checkout session
--     (either top-up or subscribe). Reused across both surfaces so the
--     customer's payment methods, invoices, and recurring sub all share one
--     Stripe Customer record.
--
-- billing_subscriptions:
--   - Mirrors the state of the workspace's ONE active recurring Stripe
--     Subscription. Updated by the webhook on customer.subscription.*
--     events. UNIQUE(workspace_id) at MVP — at most one recurring plan per
--     workspace; upgrades replace the row, cancellations flip the status.
--   - One-shot top-ups do NOT write here. Their state lives in
--     credit_transactions.external_ref.
--
-- Service role does all writes (webhook handler runs without an auth user).
-- Workspace members can read their billing row through RLS.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. workspaces.stripe_customer_id
-- ============================================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT NULL UNIQUE;

COMMENT ON COLUMN public.workspaces.stripe_customer_id IS
  'Stripe Customer id (cus_...). Created on first Checkout session, reused '
  'across top-ups and recurring subscriptions for this workspace.';


-- ============================================================================
-- 2. billing_subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id               UUID NOT NULL UNIQUE
                               REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stripe_subscription_id     TEXT NOT NULL UNIQUE,
  status                     TEXT NOT NULL,
  current_period_end         TIMESTAMPTZ,
  monthly_credit_amount_eur  NUMERIC(10,4) NOT NULL CHECK (monthly_credit_amount_eur >= 0),
  stripe_price_id            TEXT NOT NULL,
  cancel_at_period_end       BOOLEAN NOT NULL DEFAULT false,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status
  ON public.billing_subscriptions(status);

COMMENT ON TABLE public.billing_subscriptions IS
  'Workspace recurring Stripe Subscription state. UNIQUE per workspace — '
  'at most one active recurring plan at MVP. Status mirrors Stripe lifecycle '
  '(active, past_due, canceled, etc.). monthly_credit_amount_eur is the '
  'amount added to workspaces.balance_eur at each invoice.paid.';


-- ============================================================================
-- 3. updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_billing_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_subscriptions_touch_updated_at ON public.billing_subscriptions;
CREATE TRIGGER trg_billing_subscriptions_touch_updated_at
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_billing_subscriptions_updated_at();


-- ============================================================================
-- 4. RLS — workspace members read; only service role writes (via webhook)
-- ============================================================================

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_read_billing_subscriptions"
  ON public.billing_subscriptions;
CREATE POLICY "workspace_members_read_billing_subscriptions"
  ON public.billing_subscriptions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- No INSERT / UPDATE / DELETE policy for authenticated: the webhook handler
-- runs with the service role key, which bypasses RLS.


COMMIT;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   DROP TABLE IF EXISTS public.billing_subscriptions;
--   DROP FUNCTION IF EXISTS public.touch_billing_subscriptions_updated_at();
--   ALTER TABLE public.workspaces DROP COLUMN IF EXISTS stripe_customer_id;
-- COMMIT;
-- ============================================================================
