-- ============================================================================
-- Migration 003: Add UNIQUE constraint on user_agents(workspace_id, name)
-- ============================================================================
-- Prevents duplicate user-agent names within the same workspace.
-- Required by E-004 (AI Bots) for duplicate detection at the service layer.
-- ============================================================================

ALTER TABLE public.user_agents
  ADD CONSTRAINT user_agents_workspace_name_unique
  UNIQUE(workspace_id, name);

-- ROLLBACK:
-- ALTER TABLE public.user_agents DROP CONSTRAINT IF EXISTS user_agents_workspace_name_unique;
