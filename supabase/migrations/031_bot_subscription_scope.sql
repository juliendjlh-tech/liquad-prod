-- ============================================================================
-- Migration 031: move scope_to_workspace from workspace_bots to bot_subscriptions
-- ============================================================================
--
-- The scope flag is moving down one level in the hierarchy: from
-- (workspace, bot) — where it forced an "either/or" choice for any given
-- preset — to (bot_subscription) — where each subscription carries its own
-- scope. This unlocks the case where a single workspace wants the same bot
-- (e.g. ChatGPT-User) for two distinct purposes simultaneously:
--
--   - subscriptions sold to partners/customers (scope_to_workspace = true)
--   - subscriptions used internally for veille across the network (false)
--
-- UX policy (Option F — default safe + explicit opt-in):
--   New subscriptions default to scope_to_workspace = TRUE. Network access
--   is a deliberate per-subscription opt-in driven from the dashboard.
--
-- Backfill policy:
--   All existing subscriptions are reset to TRUE. Workspaces that previously
--   had bots in "My bots" mode (Mode A, cross-network) must re-opt-in
--   network access from the new UI. This is intentional: it forces the
--   safer default to apply uniformly post-migration.
--
-- IMPORTANT: No production data exists. Safe to run as a single transaction.
-- ============================================================================

BEGIN;

ALTER TABLE public.bot_subscriptions
  ADD COLUMN scope_to_workspace BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.bot_subscriptions.scope_to_workspace IS
  'When true (default), this subscription only sees catalogs owned by its '
  'workspace_id. When false, opt-in network access — the subscription sees '
  'all matching network catalogs and the wallet is debited for paid '
  'content. Toggled via the dashboard, no API key rotation required.';

UPDATE public.bot_subscriptions
  SET scope_to_workspace = true;

ALTER TABLE public.workspace_bots
  DROP COLUMN scope_to_workspace;

COMMIT;
