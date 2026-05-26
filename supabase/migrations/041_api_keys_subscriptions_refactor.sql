-- ============================================================================
-- Migration 041: api_keys + subscriptions refactor for the Network model
-- ============================================================================
--
-- Subscriptions become pure wallets:
--   - Drop scope_to_workspace (no more publisher scope on a subscription —
--     access scope is now driven by the api_key's network).
--   - Drop catalog_ids (allowlist replaced by network membership).
--   - Drop max_price_eur (price cap can be revisited later if needed).
--
-- API keys become an immutable triple:
--   - subscription_id: which wallet pays for grants (unchanged).
--   - network_id     : which bundle of catalogues this key can reach.
--   - bot_id         : the bot identity this key impersonates at /licenses.
--
-- We drop default_bot_id (migration 033) since bot_id is now required on the
-- key itself — no more body fallback.
--
-- A trigger enforces that the bot is derived from the network: it must be
-- referenced by at least one ACCEPTED catalogue in the network's catalogue
-- set (catalog_bots ∩ network_catalogs).
--
-- ⚠️ This migration is destructive for api_keys. Per MVP context (no production
-- data), existing keys are truncated and must be re-issued through the new
-- creation flow. credit_transactions.api_key_id is ON DELETE SET NULL so the
-- ledger survives.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. subscriptions: drop legacy access-scope columns
-- ============================================================================

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_max_price_eur_nonneg_chk,
  DROP COLUMN IF EXISTS scope_to_workspace,
  DROP COLUMN IF EXISTS catalog_ids,
  DROP COLUMN IF EXISTS max_price_eur;


-- ============================================================================
-- 2. api_keys: truncate before adding NOT NULL columns
-- ============================================================================
-- Existing api_keys can no longer satisfy the new NOT NULL constraints.
-- credit_transactions retain their reference via ON DELETE SET NULL.

TRUNCATE TABLE public.api_keys CASCADE;


-- ============================================================================
-- 3. api_keys: drop default_bot_id, add network_id + bot_id (both NOT NULL)
-- ============================================================================

DROP INDEX IF EXISTS public.idx_api_keys_default_bot;

ALTER TABLE public.api_keys
  DROP COLUMN IF EXISTS default_bot_id,
  ADD COLUMN network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE RESTRICT,
  ADD COLUMN bot_id     UUID NOT NULL REFERENCES public.bots(id)     ON DELETE RESTRICT;

CREATE INDEX idx_api_keys_network ON public.api_keys(network_id);
CREATE INDEX idx_api_keys_bot     ON public.api_keys(bot_id);

COMMENT ON COLUMN public.api_keys.network_id IS
  'Bundle of catalogues this key can reach at /licenses time. Immutable after '
  'creation — rotate the key to change scope.';

COMMENT ON COLUMN public.api_keys.bot_id IS
  'Bot identity claimed by this key. Validated at creation against the set '
  'derived from network_catalogs(accepted) ∩ catalog_bots.';


-- ============================================================================
-- 4. Trigger: enforce bot_id ∈ derived bots of the network
-- ============================================================================
-- "Derived bots" = bots referenced by ANY accepted catalogue in the network.
-- The check runs on INSERT and on UPDATE of (network_id, bot_id) — so rotating
-- to a network where the bot is not derived will fail loudly.

CREATE OR REPLACE FUNCTION public.validate_api_key_bot_in_network()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_bots cb
    JOIN public.network_catalogs nc ON nc.catalog_id = cb.catalog_id
    WHERE nc.network_id = NEW.network_id
      AND nc.status     = 'accepted'
      AND cb.bot_id     = NEW.bot_id
  ) THEN
    RAISE EXCEPTION
      'bot_not_derived_from_network: bot=% network=%',
      NEW.bot_id, NEW.network_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_api_keys_validate_bot_in_network
  BEFORE INSERT OR UPDATE OF bot_id, network_id ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.validate_api_key_bot_in_network();


COMMIT;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_api_keys_validate_bot_in_network ON public.api_keys;
--   DROP FUNCTION IF EXISTS public.validate_api_key_bot_in_network();
--   DROP INDEX IF EXISTS public.idx_api_keys_bot;
--   DROP INDEX IF EXISTS public.idx_api_keys_network;
--   ALTER TABLE public.api_keys
--     DROP COLUMN IF EXISTS bot_id,
--     DROP COLUMN IF EXISTS network_id,
--     ADD COLUMN default_bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL;
--   CREATE INDEX idx_api_keys_default_bot ON public.api_keys(default_bot_id)
--     WHERE default_bot_id IS NOT NULL;
--   ALTER TABLE public.subscriptions
--     ADD COLUMN scope_to_workspace BOOLEAN NOT NULL DEFAULT false,
--     ADD COLUMN catalog_ids        UUID[] NOT NULL DEFAULT '{}'::uuid[],
--     ADD COLUMN max_price_eur      NUMERIC(10,4) NULL,
--     ADD CONSTRAINT subscriptions_max_price_eur_nonneg_chk
--       CHECK (max_price_eur IS NULL OR max_price_eur >= 0);
-- COMMIT;
