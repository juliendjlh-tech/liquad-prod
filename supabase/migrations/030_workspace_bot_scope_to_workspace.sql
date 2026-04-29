-- ============================================================================
-- Migration 030: workspace_bots.scope_to_workspace
-- ============================================================================
--
-- Adds a per-(workspace, bot) flag that constrains the consumer-facing API
-- (/api/consumer/licenses and /api/consumer/sources) to only return catalogs
-- owned by the workspace where the bot is registered.
--
-- Use case (Mode B — publisher-managed partnership):
--   A publisher creates a bot in their own workspace and issues an API key for
--   a partner agency. The partner should only see THIS publisher's catalogs,
--   not catalogs from other publishers that happen to share the same UA
--   pattern. Setting scope_to_workspace=true on the (publisher_workspace, bot)
--   row achieves this isolation.
--
-- Default behaviour (Mode A — consumer self-serve):
--   The flag is FALSE by default. The bot sees catalogs of any publisher
--   whose declared bot matches its UA pattern + IP intersection — the
--   pre-existing cross-workspace reconciliation logic remains unchanged.
--
-- The flag is per-(workspace, bot) — toggling it does NOT require API key
-- rotation. The next /licenses or /sources call observes the new scope.
--
-- IMPORTANT: No production data exists. Safe to run as a single transaction.
-- ============================================================================

BEGIN;

ALTER TABLE public.workspace_bots
  ADD COLUMN scope_to_workspace BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspace_bots.scope_to_workspace IS
  'When true, /licenses and /sources only return catalogs owned by '
  'workspace_bots.workspace_id. Used by publishers managing partner keys '
  '(Mode B). Default false preserves the cross-workspace reconciliation '
  'used by self-serve consumer onboarding (Mode A).';

COMMIT;
