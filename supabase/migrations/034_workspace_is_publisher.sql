-- ============================================================================
-- Migration 034: workspaces.is_publisher
-- ============================================================================
--
-- Splits the dashboard into two interfaces backed by a single workspace flag:
--   - is_publisher = true  → publisher mode (manage bots/catalogs/domains,
--                            issue subscriptions to partners). Users land on
--                            /dashboard/publisher and can switch to /access.
--   - is_publisher = false → access-only mode (consume the network through
--                            client-mode subscriptions). Users land on
--                            /dashboard/access; the publisher UI is hidden.
--
-- Default is `false` so newly-onboarded workspaces start in the simpler
-- consumer flow. Existing workspaces are flipped to `true` during this
-- migration because they were created before the split and already manage
-- publisher resources.
-- ============================================================================

BEGIN;

ALTER TABLE public.workspaces
  ADD COLUMN is_publisher boolean NOT NULL DEFAULT false;

UPDATE public.workspaces SET is_publisher = true;

COMMENT ON COLUMN public.workspaces.is_publisher IS
  'When true, the workspace can publish (bots, catalogs, domains, publisher '
  'subscriptions). When false, the workspace is consumer-only and uses '
  'client-mode subscriptions exclusively. Every workspace is implicitly a '
  'consumer; this flag only gates the publisher capability.';

COMMIT;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   ALTER TABLE public.workspaces DROP COLUMN is_publisher;
-- COMMIT;
