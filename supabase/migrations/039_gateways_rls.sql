-- Migration 039: RLS policies for gateways table.
--
-- Migration 038 created the gateways table but did not enable RLS.
-- This migration adds it, following the same pattern as migrations 002/004.
--
-- SECURITY MODEL (same as all workspace-scoped tables):
--   SELECT  — any workspace member can list/view gateways
--   ALL     — only owner or admin can create / update / delete gateways
--
-- NOTE: api_key_hash is stored in the row. RLS ensures that no user outside
-- the workspace can read it, and the service layer never exposes it via the
-- public GatewayPublic shape (only api_key_prefix is returned).

ALTER TABLE public.gateways ENABLE ROW LEVEL SECURITY;

-- Read: any workspace member can view gateways.
CREATE POLICY "workspace_members_read_gateways" ON public.gateways
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Write: owner or admin only (INSERT / UPDATE / DELETE).
CREATE POLICY "workspace_admins_write_gateways" ON public.gateways
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP POLICY IF EXISTS "workspace_members_read_gateways" ON public.gateways;
-- DROP POLICY IF EXISTS "workspace_admins_write_gateways" ON public.gateways;
-- ALTER TABLE public.gateways DISABLE ROW LEVEL SECURITY;
