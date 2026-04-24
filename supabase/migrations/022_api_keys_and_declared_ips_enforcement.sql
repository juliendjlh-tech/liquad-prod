-- ============================================================================
-- Migration 022: Consumer API keys + declared_ips enforcement
--
-- ADR-006, Phase 1. No production data — minimal migration.
--
-- Scope split: the SDK publisher flow keeps using workspaces.api_key_hash.
-- This new table serves ONLY the consumer flow (/api/consumer/*).
-- Every consumer key is bound to an agent (bot), so agent_id is NOT NULL.
--
--   1. api_keys (n:1 with workspaces, bound to an agent).
--   2. Trigger: any agent linked in catalog_agents must have non-empty IPs.
-- ============================================================================


-- 1. TABLE api_keys ----------------------------------------------------------

DROP TABLE IF EXISTS public.api_keys CASCADE;

CREATE TABLE public.api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  api_key_hash TEXT NOT NULL,
  api_key_prefix TEXT NOT NULL,
  label TEXT,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_api_keys_prefix_active
  ON public.api_keys(api_key_prefix) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_workspace ON public.api_keys(workspace_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_api_keys" ON public.api_keys
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "workspace_admins_write_api_keys" ON public.api_keys
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );


-- 2. TRIGGER: catalog_agents requires non-empty declared_ips -----------------
-- Security model: ua_pattern is a label, IP is the identity. Any agent
-- activable on a catalog must declare IPs.

CREATE OR REPLACE FUNCTION public.check_agent_has_ips()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.agents
    WHERE id = NEW.agent_id AND array_length(declared_ips, 1) >= 1
  ) THEN
    RAISE EXCEPTION 'agent_missing_declared_ips: agent % has no declared IPs', NEW.agent_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_agents_require_ips ON public.catalog_agents;

CREATE TRIGGER trg_catalog_agents_require_ips
  BEFORE INSERT OR UPDATE ON public.catalog_agents
  FOR EACH ROW EXECUTE FUNCTION public.check_agent_has_ips();
