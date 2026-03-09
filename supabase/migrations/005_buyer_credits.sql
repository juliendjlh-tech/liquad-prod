-- ============================================================================
-- Migration 005: Buyer Credits System
-- ============================================================================
--
-- Creates the buyer credits system for AI bots to pay for content access.
--
--   1. ALTER workspaces: balance_eur, initial_credit_eur, api_key_prefix, jwt_signing_secret
--   2. CREATE TABLE credit_transactions (immutable financial ledger)
--   3. CREATE TABLE access_grants (dedup cache, 5-min TTL)
--   4. CREATE FUNCTION check_cache_and_debit (atomic RPC)
--   5. ALTER sdk_events: new decision types + consumer_workspace_id
--   6. RLS policies for new tables
--   7. Backfill existing workspaces with credits and secrets
--
-- REFERENCES:
--   - PRD: PRDs/liquid-buyer-credits-v2.md
--   - ADR: ADRs/ADR-002-buyer-credits-preflight-jwt.md
-- ============================================================================


-- ============================================================================
-- 1. ALTER workspaces: Add buyer credits columns
-- ============================================================================

ALTER TABLE public.workspaces
  ADD COLUMN balance_eur DECIMAL(10,2) NOT NULL DEFAULT 10.00
  CONSTRAINT ws_balance_non_negative CHECK (balance_eur >= 0);

ALTER TABLE public.workspaces
  ADD COLUMN initial_credit_eur DECIMAL(10,2) NOT NULL DEFAULT 10.00;

-- API key prefix for O(1) lookup (first 11 chars: "lq_" + 8 chars)
ALTER TABLE public.workspaces
  ADD COLUMN api_key_prefix TEXT;

-- JWT signing secret (32 bytes, base64 encoded) — nullable temporarily
ALTER TABLE public.workspaces
  ADD COLUMN jwt_signing_secret TEXT;


-- ============================================================================
-- 2. Backfill jwt_signing_secret for existing workspaces
-- ============================================================================

UPDATE public.workspaces
SET jwt_signing_secret = encode(gen_random_bytes(32), 'base64')
WHERE jwt_signing_secret IS NULL;

ALTER TABLE public.workspaces
  ALTER COLUMN jwt_signing_secret SET NOT NULL;

ALTER TABLE public.workspaces
  ALTER COLUMN jwt_signing_secret SET DEFAULT encode(gen_random_bytes(32), 'base64');


-- ============================================================================
-- 3. Indexes
-- ============================================================================

-- O(1) API key lookup by prefix (partial: only non-null prefixes)
CREATE UNIQUE INDEX idx_ws_api_key_prefix
  ON public.workspaces(api_key_prefix)
  WHERE api_key_prefix IS NOT NULL;

-- Prevent duplicate verified domains across workspaces
CREATE UNIQUE INDEX idx_domains_verified_unique
  ON public.domains(domain)
  WHERE status = 'verified';


-- ============================================================================
-- 4. CREATE TABLE credit_transactions
-- ============================================================================
-- Immutable financial ledger. Every balance change is recorded.
-- Sign convention: debit < 0, credits > 0.
-- ON DELETE RESTRICT: protect financial records.

CREATE TABLE public.credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  consumer_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  publisher_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('debit', 'initial_credit', 'refund', 'topup')),
  amount_eur DECIMAL(10,2) NOT NULL,
  content_url TEXT,
  catalog_id UUID REFERENCES public.catalogs(id) ON DELETE SET NULL,
  grant_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ct_amount_sign CHECK (
    (type = 'debit' AND amount_eur < 0)
    OR (type IN ('initial_credit', 'refund', 'topup') AND amount_eur > 0)
  )
);

CREATE INDEX idx_ct_consumer ON public.credit_transactions(consumer_workspace_id, created_at DESC);
CREATE INDEX idx_ct_publisher ON public.credit_transactions(publisher_workspace_id, created_at DESC);


-- ============================================================================
-- 5. CREATE TABLE access_grants
-- ============================================================================
-- Deduplication cache for paid content access.
-- UNIQUE (consumer_workspace_id, url): one active grant per consumer+URL.

CREATE TABLE public.access_grants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  consumer_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  price_eur DECIMAL(10,2) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_ag_consumer_url ON public.access_grants(consumer_workspace_id, url);
CREATE INDEX idx_ag_expires ON public.access_grants(expires_at);


-- ============================================================================
-- 6. CREATE FUNCTION check_cache_and_debit
-- ============================================================================
-- Atomic RPC: cache check + balance verify + debit + grant + transaction
-- in a single DB transaction. Prevents race conditions via FOR UPDATE.

CREATE OR REPLACE FUNCTION public.check_cache_and_debit(
  p_consumer_id UUID,
  p_publisher_id UUID,
  p_url TEXT,
  p_catalog_id UUID,
  p_price_eur DECIMAL,
  p_ttl_minutes INTEGER DEFAULT 5
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant access_grants%ROWTYPE;
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
  v_grant_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1. Check cache: active grant for this consumer + URL
  SELECT * INTO v_grant
  FROM access_grants
  WHERE consumer_workspace_id = p_consumer_id
    AND url = p_url
    AND expires_at > now();

  IF FOUND THEN
    SELECT balance_eur INTO v_current_balance
    FROM workspaces WHERE id = p_consumer_id;

    RETURN jsonb_build_object(
      'success', true,
      'cached', true,
      'grant_id', v_grant.id,
      'new_balance', v_current_balance,
      'expires_at', v_grant.expires_at
    );
  END IF;

  -- 2. Lock consumer workspace row (prevents concurrent debits)
  SELECT balance_eur INTO v_current_balance
  FROM workspaces
  WHERE id = p_consumer_id
  FOR UPDATE;

  -- 3. Check sufficient balance
  IF v_current_balance < p_price_eur THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'insufficient_balance',
      'balance', v_current_balance
    );
  END IF;

  -- 4. Debit balance
  v_new_balance := v_current_balance - p_price_eur;
  UPDATE workspaces
  SET balance_eur = v_new_balance, updated_at = now()
  WHERE id = p_consumer_id;

  -- 5. Create/update access grant (upsert: replace expired grants)
  v_expires_at := now() + (p_ttl_minutes || ' minutes')::interval;

  INSERT INTO access_grants (id, consumer_workspace_id, publisher_workspace_id, url, catalog_id, price_eur, expires_at)
  VALUES (gen_random_uuid(), p_consumer_id, p_publisher_id, p_url, p_catalog_id, p_price_eur, v_expires_at)
  ON CONFLICT (consumer_workspace_id, url)
  DO UPDATE SET
    publisher_workspace_id = EXCLUDED.publisher_workspace_id,
    catalog_id = EXCLUDED.catalog_id,
    price_eur = EXCLUDED.price_eur,
    expires_at = EXCLUDED.expires_at,
    created_at = now()
  RETURNING id INTO v_grant_id;

  -- 6. Record debit transaction
  INSERT INTO credit_transactions (consumer_workspace_id, publisher_workspace_id, type, amount_eur, content_url, catalog_id, grant_id)
  VALUES (p_consumer_id, p_publisher_id, 'debit', -p_price_eur, p_url, p_catalog_id, v_grant_id);

  RETURN jsonb_build_object(
    'success', true,
    'cached', false,
    'grant_id', v_grant_id,
    'new_balance', v_new_balance,
    'expires_at', v_expires_at
  );
END;
$$;


-- ============================================================================
-- 7. ALTER sdk_events: consumer_workspace_id + new decision types
-- ============================================================================

ALTER TABLE public.sdk_events
  ADD COLUMN consumer_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- Replace the inline CHECK constraint with an extended one
ALTER TABLE public.sdk_events
  DROP CONSTRAINT IF EXISTS sdk_events_decision_check;

ALTER TABLE public.sdk_events
  ADD CONSTRAINT sdk_events_decision_check
  CHECK (decision IN (
    'granted', 'denied', 'blocked_no_catalog',
    'authorized_paid', 'denied_authorization_required', 'denied_invalid_token'
  ));


-- ============================================================================
-- 8. RLS Policies
-- ============================================================================

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ct_select_own ON public.credit_transactions
  FOR SELECT USING (
    consumer_workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR publisher_workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- No direct INSERT (service role only, via RPC)
CREATE POLICY ct_insert_service ON public.credit_transactions
  FOR INSERT WITH CHECK (false);

ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY ag_select_own ON public.access_grants
  FOR SELECT USING (
    consumer_workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );


-- ============================================================================
-- 9. Initial credit transaction for existing workspaces
-- ============================================================================

INSERT INTO public.credit_transactions (consumer_workspace_id, publisher_workspace_id, type, amount_eur, description)
SELECT id, id, 'initial_credit', 10.00, 'Welcome credit'
FROM public.workspaces;


-- ============================================================================
-- ROLLBACK SQL
-- ============================================================================
-- DROP POLICY IF EXISTS ag_select_own ON public.access_grants;
-- DROP POLICY IF EXISTS ct_insert_service ON public.credit_transactions;
-- DROP POLICY IF EXISTS ct_select_own ON public.credit_transactions;
-- DROP FUNCTION IF EXISTS public.check_cache_and_debit;
-- DROP TABLE IF EXISTS public.access_grants;
-- DROP TABLE IF EXISTS public.credit_transactions;
-- ALTER TABLE public.sdk_events DROP COLUMN IF EXISTS consumer_workspace_id;
-- ALTER TABLE public.sdk_events DROP CONSTRAINT IF EXISTS sdk_events_decision_check;
-- ALTER TABLE public.sdk_events ADD CONSTRAINT sdk_events_decision_check
--   CHECK (decision IN ('granted', 'denied', 'blocked_no_catalog'));
-- DROP INDEX IF EXISTS idx_domains_verified_unique;
-- DROP INDEX IF EXISTS idx_ws_api_key_prefix;
-- ALTER TABLE public.workspaces DROP COLUMN IF EXISTS jwt_signing_secret;
-- ALTER TABLE public.workspaces DROP COLUMN IF EXISTS api_key_prefix;
-- ALTER TABLE public.workspaces DROP COLUMN IF EXISTS initial_credit_eur;
-- ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS ws_balance_non_negative;
-- ALTER TABLE public.workspaces DROP COLUMN IF EXISTS balance_eur;
