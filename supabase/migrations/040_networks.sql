-- ============================================================================
-- Migration 040: Networks (catalog bundles for sub managers)
-- ============================================================================
--
-- A network is a publisher-owned bundle of catalogues — including catalogues
-- from OTHER publishers, provided they accept the invitation. The owning
-- workspace is the "sub manager": it issues API keys whose access spans the
-- accepted catalogues of the bundle.
--
-- network_catalogs holds the invite lifecycle: pending → accepted → revoked.
-- Only `accepted` rows count when resolving access at /licenses time.
--
-- Auto-acceptance for catalogues owned by the network's workspace is enforced
-- at the service layer (network.service.ts) — the schema allows any starting
-- status so the DB does not need a special-case trigger.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. networks
-- ============================================================================

CREATE TABLE public.networks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id     TEXT NOT NULL UNIQUE
                  CHECK (starts_with(public_id, 'net_')),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_networks_workspace_id ON public.networks(workspace_id);

COMMENT ON TABLE public.networks IS
  'Bundles of catalogues owned by a sub manager workspace. API keys reference '
  'exactly one network (api_keys.network_id) and the consumer can pull signed '
  'URLs for any URL covered by an accepted catalogue in that bundle.';


-- ============================================================================
-- 2. network_catalogs (junction with invite lifecycle)
-- ============================================================================

CREATE TYPE public.network_catalog_status AS ENUM (
  'pending',
  'accepted',
  'revoked'
);

CREATE TABLE public.network_catalogs (
  network_id    UUID NOT NULL REFERENCES public.networks(id)  ON DELETE CASCADE,
  catalog_id    UUID NOT NULL REFERENCES public.catalogs(id)  ON DELETE CASCADE,
  status        public.network_catalog_status NOT NULL DEFAULT 'pending',
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ NULL,
  invited_by    UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (network_id, catalog_id)
);

-- Reverse lookup: "which networks reference this catalogue?"
CREATE INDEX idx_network_catalogs_catalog ON public.network_catalogs(catalog_id);

-- Hot-path partial index: only accepted rows are scanned at /licenses time.
CREATE INDEX idx_network_catalogs_accepted
  ON public.network_catalogs(network_id, catalog_id)
  WHERE status = 'accepted';

COMMENT ON TABLE public.network_catalogs IS
  'Invite-driven membership of catalogues in a network. The catalogue owner '
  'must transition the row from pending to accepted before the catalogue is '
  'visible at /licenses time.';

COMMENT ON COLUMN public.network_catalogs.status IS
  'pending: invite sent, awaiting catalogue owner. accepted: live in network. '
  'revoked: removed by the catalogue owner (kept for audit, not re-invitable '
  'without a new row).';


-- ============================================================================
-- 3. RLS
-- ============================================================================
--
-- networks:        owner workspace members read/write.
-- network_catalogs:
--   SELECT — owner workspace members of the network OR of the catalogue.
--   INSERT — owner/admin of the network workspace (inviting).
--   UPDATE — owner/admin of the catalogue's workspace (responding).
--   DELETE — disallowed (use status='revoked' to keep audit).
-- ============================================================================

ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_catalogs ENABLE ROW LEVEL SECURITY;

-- networks: read for any workspace member.
CREATE POLICY "workspace_members_read_networks" ON public.networks
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- networks: write only for owner/admin.
CREATE POLICY "workspace_admins_write_networks" ON public.networks
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- network_catalogs: read by members of EITHER the network's workspace OR the catalogue's workspace.
CREATE POLICY "members_read_network_catalogs" ON public.network_catalogs
  FOR SELECT
  USING (
    network_id IN (
      SELECT n.id FROM public.networks n
      JOIN public.workspace_members wm ON wm.workspace_id = n.workspace_id
      WHERE wm.user_id = auth.uid()
    )
    OR catalog_id IN (
      SELECT c.id FROM public.catalogs c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- network_catalogs: INSERT (invite) by network workspace owner/admin only.
CREATE POLICY "network_admins_invite_catalogs" ON public.network_catalogs
  FOR INSERT
  WITH CHECK (
    network_id IN (
      SELECT n.id FROM public.networks n
      JOIN public.workspace_members wm ON wm.workspace_id = n.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );

-- network_catalogs: UPDATE (respond to invite) by catalogue workspace owner/admin only.
CREATE POLICY "catalog_admins_respond_to_invites" ON public.network_catalogs
  FOR UPDATE
  USING (
    catalog_id IN (
      SELECT c.id FROM public.catalogs c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );


-- ============================================================================
-- 4. updated_at trigger on networks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_networks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_networks_touch_updated_at
  BEFORE UPDATE ON public.networks
  FOR EACH ROW EXECUTE FUNCTION public.touch_networks_updated_at();


COMMIT;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_networks_touch_updated_at ON public.networks;
--   DROP FUNCTION IF EXISTS public.touch_networks_updated_at();
--   DROP POLICY IF EXISTS "catalog_admins_respond_to_invites" ON public.network_catalogs;
--   DROP POLICY IF EXISTS "network_admins_invite_catalogs" ON public.network_catalogs;
--   DROP POLICY IF EXISTS "members_read_network_catalogs" ON public.network_catalogs;
--   DROP POLICY IF EXISTS "workspace_admins_write_networks" ON public.networks;
--   DROP POLICY IF EXISTS "workspace_members_read_networks" ON public.networks;
--   DROP INDEX IF EXISTS public.idx_network_catalogs_accepted;
--   DROP INDEX IF EXISTS public.idx_network_catalogs_catalog;
--   DROP TABLE IF EXISTS public.network_catalogs;
--   DROP TYPE  IF EXISTS public.network_catalog_status;
--   DROP INDEX IF EXISTS public.idx_networks_workspace_id;
--   DROP TABLE IF EXISTS public.networks;
-- COMMIT;
