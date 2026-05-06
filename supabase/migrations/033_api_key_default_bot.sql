-- ============================================================================
-- Migration 033: api_keys.default_bot_id
-- ============================================================================
--
-- Adds an optional default bot binding to consumer API keys.
--
-- Rationale: a publisher can issue a key for a partner who only knows their
-- API key — not the internal UUID of the custom bot the publisher created
-- for them. With default_bot_id, /licenses falls back to this value when
-- the body omits bot_id. Keys without default_bot_id keep their bot-agnostic
-- behaviour (caller must pass bot_id at every /licenses call).
--
-- ON DELETE SET NULL: if the bot is removed, the key stays usable but its
-- partner must again pass bot_id explicitly. Avoids cascade-revoking keys
-- on bot lifecycle events.
-- ============================================================================

BEGIN;

ALTER TABLE public.api_keys
  ADD COLUMN default_bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL;

CREATE INDEX idx_api_keys_default_bot ON public.api_keys(default_bot_id)
  WHERE default_bot_id IS NOT NULL;

COMMENT ON COLUMN public.api_keys.default_bot_id IS
  'Optional bot used as fallback when /licenses body omits bot_id. Validated '
  'at key creation against workspace_bots(workspace_id). NULL = caller must '
  'pass bot_id explicitly on every call.';

COMMIT;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   DROP INDEX IF EXISTS idx_api_keys_default_bot;
--   ALTER TABLE public.api_keys DROP COLUMN default_bot_id;
-- COMMIT;
