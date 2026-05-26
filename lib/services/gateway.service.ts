// ---------------------------------------------------------------------------
// Gateway service
//
// A gateway is a publisher-side SDK endpoint identified by its own API key.
// Each gateway carries a `catalog_ids` allowlist that restricts which
// catalogs the SDK exposes (free catalogs only — paid content uses
// /api/public/v1/consumer/licenses instead).
//
// Workspaces can have N gateways (e.g. one per deployment). Since migration
// 038, the legacy single-key-per-workspace model is gone.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generatePublicId } from "@/lib/ids";
import {
  generateApiKey,
  hashApiKey,
} from "@/lib/services/workspace.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateGatewayInput {
  label?: string | null;
  /** Initial catalog allowlist as public ids (cat_xxxxx). Empty = no catalogs. */
  catalogPublicIds?: string[];
}

export interface UpdateGatewayInput {
  label?: string | null;
  /** Catalog allowlist as public ids. undefined = no change. */
  catalogPublicIds?: string[];
}

export interface GatewayPublic {
  id: string;
  public_id: string;
  workspace_id: string;
  label: string | null;
  /** First 11 characters of the key (e.g. "lq_abc1234"). Full key never re-shown. */
  api_key_prefix: string;
  /** Catalog allowlist as public ids. Orphaned ids (deleted catalog) are dropped. */
  catalog_ids: string[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertRole(
  workspaceId: string,
  userId: string,
  allowed: Array<"owner" | "admin" | "member">
): Promise<void> {
  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (!membership) throw new Error("NOT_MEMBER");
  if (!allowed.includes(membership.role as "owner" | "admin" | "member")) {
    throw new Error("FORBIDDEN");
  }
}

/**
 * Translate public catalog ids to internal UUIDs and enforce ownership:
 * each catalog must belong to the gateway's workspace. Status is irrelevant —
 * a workspace can expose private (inactive) catalogs via its own gateways.
 * Throws INVALID_CATALOG_IDS if any id is unknown or owned by a different workspace.
 */
async function resolveWorkspaceCatalogPublicIds(
  workspaceId: string,
  catalogPublicIds: string[]
): Promise<string[]> {
  if (catalogPublicIds.length === 0) return [];

  const supabase = await createServerClient();
  const { data: rows, error } = await supabase
    .from("catalogs")
    .select("id, public_id")
    .in("public_id", catalogPublicIds)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(`CATALOG_LOOKUP_FAILED: ${error.message}`);
  const found = rows ?? [];
  if (found.length !== new Set(catalogPublicIds).size) {
    throw new Error("INVALID_CATALOG_IDS");
  }
  return found.map((r) => r.id);
}

async function toPublic(
  row: {
    id: string;
    public_id: string;
    workspace_id: string;
    label: string | null;
    api_key_prefix: string;
    catalog_ids: string[];
    created_at: string;
  },
  publicIdByUuid: Map<string, string>
): Promise<GatewayPublic> {
  return {
    id: row.id,
    public_id: row.public_id,
    workspace_id: row.workspace_id,
    label: row.label,
    api_key_prefix: row.api_key_prefix,
    catalog_ids: (row.catalog_ids ?? [])
      .map((uuid) => publicIdByUuid.get(uuid))
      .filter((v): v is string => typeof v === "string"),
    created_at: row.created_at,
  };
}

async function buildPublicIdMap(
  catalogUuids: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (catalogUuids.length === 0) return out;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("catalogs")
    .select("id, public_id")
    .in("id", catalogUuids);
  for (const row of data ?? []) out.set(row.id, row.public_id);
  return out;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new gateway. Returns the plaintext API key (shown once).
 * Owner/admin only.
 */
export async function createGateway(
  workspaceId: string,
  userId: string,
  input: CreateGatewayInput
): Promise<{ gateway: GatewayPublic; api_key: string }> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const catalogInternalIds = await resolveWorkspaceCatalogPublicIds(
    workspaceId,
    input.catalogPublicIds ?? []
  );

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("gateways")
    .insert({
      public_id: generatePublicId("gw"),
      workspace_id: workspaceId,
      label: input.label ?? null,
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKey.slice(0, 11),
      catalog_ids: catalogInternalIds,
    })
    .select(
      "id, public_id, workspace_id, label, api_key_prefix, catalog_ids, created_at"
    )
    .single();

  if (error || !data) {
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  const publicIdByUuid = await buildPublicIdMap(catalogInternalIds);

  return {
    gateway: await toPublic(data, publicIdByUuid),
    api_key: apiKey,
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listGateways(
  workspaceId: string,
  userId: string
): Promise<GatewayPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("gateways")
    .select(
      "id, public_id, workspace_id, label, api_key_prefix, catalog_ids, created_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  const allUuids = [
    ...new Set((data ?? []).flatMap((g) => (g.catalog_ids ?? []) as string[])),
  ];
  const publicIdByUuid = await buildPublicIdMap(allUuids);

  return Promise.all((data ?? []).map((row) => toPublic(row, publicIdByUuid)));
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateGateway(
  workspaceId: string,
  userId: string,
  gatewayId: string,
  input: UpdateGatewayInput
): Promise<GatewayPublic> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data: existing } = await supabase
    .from("gateways")
    .select("id")
    .eq("id", gatewayId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!existing) throw new Error("NOT_FOUND");

  const update: Record<string, unknown> = {};
  if (input.label !== undefined) update.label = input.label;
  if (input.catalogPublicIds !== undefined) {
    update.catalog_ids = await resolveWorkspaceCatalogPublicIds(
      workspaceId,
      input.catalogPublicIds
    );
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from("gateways")
      .update(update)
      .eq("id", gatewayId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(`UPDATE_FAILED: ${error.message}`);
  }

  const all = await listGateways(workspaceId, userId);
  const match = all.find((g) => g.id === gatewayId);
  if (!match) throw new Error("NOT_FOUND");
  return match;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteGateway(
  workspaceId: string,
  userId: string,
  gatewayId: string
): Promise<void> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();
  const { error, count } = await supabase
    .from("gateways")
    .delete({ count: "exact" })
    .eq("id", gatewayId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(`DELETE_FAILED: ${error.message}`);
  if (!count) throw new Error("NOT_FOUND");
}

// ---------------------------------------------------------------------------
// Regenerate key
// ---------------------------------------------------------------------------

/**
 * Rotate the API key of a gateway. Owner only — regeneration breaks live
 * SDK deployments using the previous key.
 */
export async function regenerateGatewayKey(
  workspaceId: string,
  userId: string,
  gatewayId: string
): Promise<string> {
  await assertRole(workspaceId, userId, ["owner"]);

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("gateways")
    .select("id")
    .eq("id", gatewayId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!existing) throw new Error("NOT_FOUND");

  const newKey = generateApiKey();
  const newHash = await hashApiKey(newKey);

  const { error } = await supabase
    .from("gateways")
    .update({
      api_key_hash: newHash,
      api_key_prefix: newKey.slice(0, 11),
    })
    .eq("id", gatewayId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(`UPDATE_FAILED: ${error.message}`);
  return newKey;
}
