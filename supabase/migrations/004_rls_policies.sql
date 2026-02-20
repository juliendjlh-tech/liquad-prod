-- ============================================================================
-- Migration 004: RLS Policies for all tables
-- ============================================================================
--
-- Authorization is handled in the service layer (workspace membership checks,
-- role-based permissions). These RLS policies simply allow any authenticated
-- user to perform operations. The service layer filters by workspace_id and
-- verifies permissions before any query.
--
-- Without these policies, RLS blocks all operations since Supabase enables
-- RLS by default on new tables.
-- ============================================================================

-- workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.workspaces
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- workspace_members
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.workspace_members
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- domains
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.domains
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- contents
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.contents
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- user_agents
ALTER TABLE public.user_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.user_agents
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- catalogs
ALTER TABLE public.catalogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.catalogs
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- catalog_agents
ALTER TABLE public.catalog_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.catalog_agents
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- sdk_events: also needs service_role access for SDK API (no user session)
ALTER TABLE public.sdk_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.sdk_events
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.sdk_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
