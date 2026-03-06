-- ============================================================================
-- Migration 002: Row Level Security (RLS) Policies
-- ============================================================================
--
-- This migration enables RLS on all 6 new tables and creates policies
-- that enforce multi-tenant data isolation at the database level.
--
-- SECURITY MODEL:
-- Liquad uses a dual-layer security approach:
--   1. Next.js Middleware: Protects routes at the HTTP level
--   2. Supabase RLS (this file): Protects data at the SQL level
--
-- Even if a bug in the application layer allows unauthorized access,
-- RLS ensures that users can ONLY see/modify data from workspaces
-- they belong to. This is defense-in-depth.
--
-- PATTERN:
-- All policies follow the same pattern:
--   - SELECT (read): User must be a member of the workspace (any role)
--   - INSERT/UPDATE/DELETE (write): User must be owner or admin
--
-- EXCEPTION: sdk_events
--   - No user-facing write policy. Events are inserted by the SDK
--     using the service_role key, which bypasses RLS entirely.
--   - Users can only READ their workspace's events.
--
-- EXCEPTION: catalog_agents
--   - This is a junction table without a direct workspace_id column.
--   - Policies use a subquery through the catalogs table to find the
--     workspace_id.
--
-- DEPENDENCIES:
--   - Migration 001 must have been applied (tables must exist)
--   - workspace_members table must exist with user_id and role columns
--
-- ROLLBACK: See bottom of this file.
-- ============================================================================


-- ============================================================================
-- DOMAINS
-- ============================================================================
-- Read: Any workspace member can view the workspace's domains.
-- Write: Only owner or admin can add/modify/delete domains.
-- ============================================================================
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_domains" ON public.domains
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_admins_write_domains" ON public.domains
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );


-- ============================================================================
-- CONTENTS
-- ============================================================================
-- Read: Any workspace member can view imported content.
-- Write: Only owner or admin can import/modify/delete content.
-- ============================================================================
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_contents" ON public.contents
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_admins_write_contents" ON public.contents
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );


-- ============================================================================
-- USER_AGENTS
-- ============================================================================
-- Read: Any workspace member can view declared bots.
-- Write: Only owner or admin can add/modify/delete bot declarations.
-- ============================================================================
ALTER TABLE public.user_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_user_agents" ON public.user_agents
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_admins_write_user_agents" ON public.user_agents
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );


-- ============================================================================
-- CATALOGS
-- ============================================================================
-- Read: Any workspace member can view catalogs.
-- Write: Only owner or admin can create/modify/delete catalogs.
-- ============================================================================
ALTER TABLE public.catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_catalogs" ON public.catalogs
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_admins_write_catalogs" ON public.catalogs
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );


-- ============================================================================
-- CATALOG_AGENTS (junction table)
-- ============================================================================
-- This table has no direct workspace_id column. We determine the workspace
-- by joining through the catalogs table (catalog_id -> catalogs.workspace_id).
--
-- Read: Any workspace member can view catalog-agent associations.
-- Write: Only owner or admin can manage which bots are in a catalog.
-- ============================================================================
ALTER TABLE public.catalog_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_catalog_agents" ON public.catalog_agents
  FOR SELECT
  USING (
    catalog_id IN (
      SELECT c.id FROM public.catalogs c
      INNER JOIN public.workspace_members wm
        ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_admins_write_catalog_agents" ON public.catalog_agents
  FOR ALL
  USING (
    catalog_id IN (
      SELECT c.id FROM public.catalogs c
      INNER JOIN public.workspace_members wm
        ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );


-- ============================================================================
-- SDK_EVENTS
-- ============================================================================
-- Read: Any workspace member can view their workspace's SDK events
--   (needed for the analytics dashboard).
-- Write: NO user-facing write policy. SDK events are inserted by the
--   publisher's server-side SDK using the SUPABASE_SERVICE_ROLE_KEY,
--   which bypasses RLS entirely. This ensures:
--   1. Users cannot fabricate events through the dashboard
--   2. The SDK can write events without a user session
-- ============================================================================
ALTER TABLE public.sdk_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_sdk_events" ON public.sdk_events
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policy for sdk_events.
-- Events are written by the service_role key (bypasses RLS).


-- ============================================================================
-- ROLLBACK SQL
-- ============================================================================
-- To undo this migration, run the following statements:
--
-- -- Drop all policies
-- DROP POLICY IF EXISTS "workspace_members_read_domains" ON public.domains;
-- DROP POLICY IF EXISTS "workspace_admins_write_domains" ON public.domains;
-- DROP POLICY IF EXISTS "workspace_members_read_contents" ON public.contents;
-- DROP POLICY IF EXISTS "workspace_admins_write_contents" ON public.contents;
-- DROP POLICY IF EXISTS "workspace_members_read_user_agents" ON public.user_agents;
-- DROP POLICY IF EXISTS "workspace_admins_write_user_agents" ON public.user_agents;
-- DROP POLICY IF EXISTS "workspace_members_read_catalogs" ON public.catalogs;
-- DROP POLICY IF EXISTS "workspace_admins_write_catalogs" ON public.catalogs;
-- DROP POLICY IF EXISTS "workspace_members_read_catalog_agents" ON public.catalog_agents;
-- DROP POLICY IF EXISTS "workspace_admins_write_catalog_agents" ON public.catalog_agents;
-- DROP POLICY IF EXISTS "workspace_members_read_sdk_events" ON public.sdk_events;
--
-- -- Disable RLS
-- ALTER TABLE public.domains DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.contents DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.user_agents DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.catalogs DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.catalog_agents DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.sdk_events DISABLE ROW LEVEL SECURITY;
-- ============================================================================
