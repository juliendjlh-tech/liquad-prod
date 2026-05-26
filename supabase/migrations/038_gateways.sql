-- Migration 038: Introduce per-workspace gateways.
--
-- A gateway is a publisher-side SDK endpoint authenticated by its own API key
-- and restricted to a curated subset of catalogs. Workspaces can have N
-- gateways (e.g. one per deployment). The legacy single-key-per-workspace
-- model is removed — existing SDK integrations must recreate a gateway and
-- redeploy with the new key.

-- 1. Create the table.
CREATE TABLE public.gateways (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id      text NOT NULL UNIQUE
                   CHECK (starts_with(public_id, 'gw_')),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label          text NULL,
  api_key_hash   text NOT NULL,
  api_key_prefix text NOT NULL UNIQUE,
  catalog_ids    uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gateways_workspace_id ON public.gateways(workspace_id);

-- 2. Drop the legacy single key per workspace.
DROP INDEX IF EXISTS public.idx_ws_api_key_prefix;

ALTER TABLE public.workspaces
  DROP COLUMN IF EXISTS api_key_hash,
  DROP COLUMN IF EXISTS api_key_prefix;
