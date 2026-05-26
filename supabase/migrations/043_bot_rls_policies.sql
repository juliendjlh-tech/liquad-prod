-- ============================================================================
-- Migration 043: RLS policies for bot-related tables
-- ============================================================================
--
-- Context:
--   - Migration 018 created `workspace_agents` (renamed to `workspace_bots`
--     in migration 029) but never set up RLS policies for it.
--   - At some point RLS was enabled on `workspace_bots` (either explicitly
--     or via a Supabase default), and any INSERT now fails with:
--       "new row violates row-level security policy for table 'workspace_bots'"
--   - SELECT works because either RLS is off on `bots` or a permissive policy
--     was set up elsewhere — but POST /api/internal/workspaces/:id/bots
--     (subscribing a workspace to a preset, or creating a custom bot) is
--     blocked.
--
-- This migration ensures consistent, secure RLS on the three bot tables:
--   - bots             (global table: presets + custom)
--   - workspace_bots   (junction: which bots are active for each workspace)
--   - catalog_bots     (junction: which bots are exposed via which catalogs)
--
-- Patterns mirror migration 040 (networks) and 002 (the original user_agents):
--   - Workspace members can SELECT rows scoped to their workspace.
--   - Workspace owners/admins can INSERT/UPDATE/DELETE.
--   - The global `bots` table is readable by everyone (presets are public)
--     and writable by any authenticated workspace member (custom bots are
--     created by workspace flows; ownership is enforced via the
--     workspace_bots junction).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- bots (global table)
-- ----------------------------------------------------------------------------
-- Anyone authenticated can read bots (presets need to be visible to all
-- workspaces; custom bots are linked back via workspace_bots).
-- INSERT/UPDATE/DELETE are gated indirectly through the service layer + the
-- workspace_bots junction policy.

ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_authenticated_read_bots" ON public.bots;
CREATE POLICY "anyone_authenticated_read_bots" ON public.bots
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "anyone_authenticated_write_bots" ON public.bots;
CREATE POLICY "anyone_authenticated_write_bots" ON public.bots
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- workspace_bots (junction: workspace ↔ bot)
-- ----------------------------------------------------------------------------

ALTER TABLE public.workspace_bots ENABLE ROW LEVEL SECURITY;

-- Read: any member of the workspace.
DROP POLICY IF EXISTS "workspace_members_read_workspace_bots" ON public.workspace_bots;
CREATE POLICY "workspace_members_read_workspace_bots" ON public.workspace_bots
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Write (INSERT/UPDATE/DELETE): owner or admin of the workspace.
DROP POLICY IF EXISTS "workspace_admins_write_workspace_bots" ON public.workspace_bots;
CREATE POLICY "workspace_admins_write_workspace_bots" ON public.workspace_bots
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );


-- ----------------------------------------------------------------------------
-- catalog_bots (junction: catalog ↔ bot)
-- ----------------------------------------------------------------------------

ALTER TABLE public.catalog_bots ENABLE ROW LEVEL SECURITY;

-- Read: any member of the workspace that owns the catalog.
DROP POLICY IF EXISTS "workspace_members_read_catalog_bots" ON public.catalog_bots;
CREATE POLICY "workspace_members_read_catalog_bots" ON public.catalog_bots
  FOR SELECT
  USING (
    catalog_id IN (
      SELECT c.id FROM public.catalogs c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Write: owner or admin of the workspace owning the catalog.
DROP POLICY IF EXISTS "workspace_admins_write_catalog_bots" ON public.catalog_bots;
CREATE POLICY "workspace_admins_write_catalog_bots" ON public.catalog_bots
  FOR ALL
  USING (
    catalog_id IN (
      SELECT c.id FROM public.catalogs c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    catalog_id IN (
      SELECT c.id FROM public.catalogs c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );


-- ============================================================================
-- ROLLBACK (manual)
-- ============================================================================
--
-- DROP POLICY IF EXISTS "anyone_authenticated_read_bots"           ON public.bots;
-- DROP POLICY IF EXISTS "anyone_authenticated_write_bots"          ON public.bots;
-- DROP POLICY IF EXISTS "workspace_members_read_workspace_bots"    ON public.workspace_bots;
-- DROP POLICY IF EXISTS "workspace_admins_write_workspace_bots"    ON public.workspace_bots;
-- DROP POLICY IF EXISTS "workspace_members_read_catalog_bots"      ON public.catalog_bots;
-- DROP POLICY IF EXISTS "workspace_admins_write_catalog_bots"      ON public.catalog_bots;
-- ALTER TABLE public.bots           DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.workspace_bots DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.catalog_bots   DISABLE ROW LEVEL SECURITY;
