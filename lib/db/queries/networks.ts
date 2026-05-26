// ---------------------------------------------------------------------------
// Network query module
//
// Centralizes queries for networks and the network_catalogs invite junction.
//
// A network is a publisher-owned bundle of catalogues — own catalogues plus
// invited catalogues from other publishers. An API key references one network
// (api_keys.network_id) and can grant access to URLs covered by any catalogue
// whose membership status is 'accepted'.
//
// Bot identity carried by an API key must be in the "derived bot set" of its
// network: bots referenced by at least one accepted catalogue via catalog_bots.
// See getNetworkDerivedBotIds for the query used at api_key creation time.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generatePublicId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NetworkCatalogStatus = "pending" | "accepted" | "revoked";

export interface NetworkRecord {
  id: string;
  public_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface NetworkCatalogRecord {
  network_id: string;
  catalog_id: string;
  status: NetworkCatalogStatus;
  invited_at: string;
  responded_at: string | null;
  invited_by: string | null;
}

export interface NetworkWithCatalogs extends NetworkRecord {
  catalogs: Array<{
    catalog_id: string;
    status: NetworkCatalogStatus;
    invited_at: string;
    responded_at: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Networks CRUD
// ---------------------------------------------------------------------------

export async function listNetworks(workspaceId: string): Promise<NetworkRecord[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("networks")
    .select("id, public_id, workspace_id, name, description, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listNetworks: ${error.message}`);
  return (data ?? []) as NetworkRecord[];
}

export async function getNetworkById(networkId: string): Promise<NetworkRecord | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("networks")
    .select("id, public_id, workspace_id, name, description, created_at, updated_at")
    .eq("id", networkId)
    .single();

  if (error) return null;
  return data as NetworkRecord;
}

export async function getNetworkWithCatalogs(networkId: string): Promise<NetworkWithCatalogs | null> {
  const network = await getNetworkById(networkId);
  if (!network) return null;

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("network_catalogs")
    .select("catalog_id, status, invited_at, responded_at")
    .eq("network_id", networkId)
    .order("invited_at", { ascending: false });

  if (error) throw new Error(`getNetworkWithCatalogs: ${error.message}`);

  return {
    ...network,
    catalogs: (data ?? []) as NetworkWithCatalogs["catalogs"],
  };
}

export async function createNetwork(input: {
  workspaceId: string;
  name: string;
  description: string | null;
}): Promise<NetworkRecord> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("networks")
    .insert({
      public_id: generatePublicId("net"),
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description,
    })
    .select("id, public_id, workspace_id, name, description, created_at, updated_at")
    .single();

  if (error) throw new Error(`createNetwork: ${error.message}`);
  return data as NetworkRecord;
}

export async function updateNetwork(
  networkId: string,
  patch: { name?: string; description?: string | null },
): Promise<NetworkRecord> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("networks")
    .update(patch)
    .eq("id", networkId)
    .select("id, public_id, workspace_id, name, description, created_at, updated_at")
    .single();

  if (error) throw new Error(`updateNetwork: ${error.message}`);
  return data as NetworkRecord;
}

export async function deleteNetwork(networkId: string): Promise<void> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("networks")
    .delete()
    .eq("id", networkId);

  if (error) throw new Error(`deleteNetwork: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Network ↔ Catalog invites
// ---------------------------------------------------------------------------

/**
 * Invite catalogues into a network. Idempotent: catalogues already present in
 * the network are skipped silently. A catalogue belonging to the network's
 * own workspace is auto-accepted (status='accepted', responded_at=now).
 *
 * Returns the number of rows inserted.
 */
export async function inviteCatalogs(input: {
  networkId: string;
  catalogIds: string[];
  invitedBy: string | null;
}): Promise<number> {
  if (input.catalogIds.length === 0) return 0;

  const supabase = await createServerClient();

  // Resolve the network's workspace once — used for auto-acceptance of own catalogues.
  const network = await getNetworkById(input.networkId);
  if (!network) throw new Error(`inviteCatalogs: network not found: ${input.networkId}`);

  const { data: catalogs, error: catErr } = await supabase
    .from("catalogs")
    .select("id, workspace_id")
    .in("id", input.catalogIds);

  if (catErr) throw new Error(`inviteCatalogs: ${catErr.message}`);

  const rows = (catalogs ?? []).map((c) => {
    const isOwn = c.workspace_id === network.workspace_id;
    return {
      network_id: input.networkId,
      catalog_id: c.id,
      status: isOwn ? ("accepted" as const) : ("pending" as const),
      responded_at: isOwn ? new Date().toISOString() : null,
      invited_by: input.invitedBy,
    };
  });

  if (rows.length === 0) return 0;

  // Idempotent insert: skip duplicates.
  const { data, error } = await supabase
    .from("network_catalogs")
    .upsert(rows, { onConflict: "network_id,catalog_id", ignoreDuplicates: true })
    .select("catalog_id");

  if (error) throw new Error(`inviteCatalogs: ${error.message}`);
  return (data ?? []).length;
}

/**
 * Respond to a pending invite. `accept` flips to 'accepted', otherwise to 'revoked'.
 * Returns the updated row, or null if no pending row exists.
 *
 * Note: 'revoked' is also used by catalogue owners who want to leave an
 * already-accepted network. The transition is one-way; to re-join, a fresh
 * invitation must be created (no UI for that in MVP).
 */
export async function respondToNetworkInvite(input: {
  networkId: string;
  catalogId: string;
  accept: boolean;
}): Promise<NetworkCatalogRecord | null> {
  const supabase = await createServerClient();

  const newStatus: NetworkCatalogStatus = input.accept ? "accepted" : "revoked";

  const { data, error } = await supabase
    .from("network_catalogs")
    .update({
      status: newStatus,
      responded_at: new Date().toISOString(),
    })
    .eq("network_id", input.networkId)
    .eq("catalog_id", input.catalogId)
    .select("network_id, catalog_id, status, invited_at, responded_at, invited_by")
    .maybeSingle();

  if (error) throw new Error(`respondToNetworkInvite: ${error.message}`);
  return (data as NetworkCatalogRecord | null) ?? null;
}

/**
 * List invites for a given catalogue (used by the catalogue page Networks section).
 * Returns rows from any status (pending / accepted / revoked) ordered by invited_at desc.
 */
export async function listInvitesForCatalog(catalogId: string): Promise<
  Array<NetworkCatalogRecord & { network: Pick<NetworkRecord, "id" | "public_id" | "name" | "workspace_id"> }>
> {
  const supabase = await createServerClient();

  type Row = {
    network_id: string;
    catalog_id: string;
    status: NetworkCatalogStatus;
    invited_at: string;
    responded_at: string | null;
    invited_by: string | null;
    networks: { id: string; public_id: string; name: string; workspace_id: string };
  };

  const { data, error } = await supabase
    .from("network_catalogs")
    .select(
      "network_id, catalog_id, status, invited_at, responded_at, invited_by, " +
        "networks(id, public_id, name, workspace_id)",
    )
    .eq("catalog_id", catalogId)
    .order("invited_at", { ascending: false }) as unknown as {
      data: Row[] | null;
      error: { message: string } | null;
    };

  if (error) throw new Error(`listInvitesForCatalog: ${error.message}`);

  return (data ?? []).map((row) => ({
    network_id: row.network_id,
    catalog_id: row.catalog_id,
    status: row.status,
    invited_at: row.invited_at,
    responded_at: row.responded_at,
    invited_by: row.invited_by,
    network: row.networks,
  }));
}

// ---------------------------------------------------------------------------
// Derived sets — used at api_key creation and at authorize() time
// ---------------------------------------------------------------------------

/**
 * Return the catalogue IDs currently 'accepted' in a network. This is the
 * authoritative allowlist consumed by consumer.service.ts at /licenses time.
 */
export async function getNetworkAcceptedCatalogIds(networkId: string): Promise<string[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("network_catalogs")
    .select("catalog_id")
    .eq("network_id", networkId)
    .eq("status", "accepted");

  if (error) throw new Error(`getNetworkAcceptedCatalogIds: ${error.message}`);
  return (data ?? []).map((row: { catalog_id: string }) => row.catalog_id);
}

/**
 * Return the bot IDs derivable from a network: any bot referenced by at least
 * one accepted catalogue in this network (via catalog_bots).
 *
 * Used by:
 *   - the api_key creation UI to populate the bot dropdown
 *   - the api_key creation service to validate the chosen bot_id (the DB
 *     trigger validate_api_key_bot_in_network enforces the same rule at INSERT)
 */
export async function getNetworkDerivedBotIds(networkId: string): Promise<string[]> {
  const supabase = await createServerClient();

  // Join via the accepted-only partial index for fast retrieval.
  // Equivalent SQL:
  //   SELECT DISTINCT cb.bot_id
  //   FROM catalog_bots cb
  //   JOIN network_catalogs nc ON nc.catalog_id = cb.catalog_id
  //   WHERE nc.network_id = $1 AND nc.status = 'accepted';
  const acceptedCatalogIds = await getNetworkAcceptedCatalogIds(networkId);
  if (acceptedCatalogIds.length === 0) return [];

  const { data, error } = await supabase
    .from("catalog_bots")
    .select("bot_id")
    .in("catalog_id", acceptedCatalogIds);

  if (error) throw new Error(`getNetworkDerivedBotIds: ${error.message}`);

  return [...new Set((data ?? []).map((row: { bot_id: string }) => row.bot_id))];
}
