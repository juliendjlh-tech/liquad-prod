// ---------------------------------------------------------------------------
// Access settings query module
//
// Centralizes queries for `access_settings` (consumer plan: bot + catalogues +
// max_price) and the `access_settings_catalogs` junction.
//
// An access settings replaces the previous (publisher-side) `networks` concept
// and the (consumer-side) `search_configs`. API keys reference exactly one
// access settings (api_keys.access_settings_id); the bot identity is carried
// by the access settings, not the key.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generatePublicId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccessSettingsRecord {
  id: string;
  public_id: string;
  workspace_id: string;
  bot_id: string;
  name: string;
  /** NULL = no cap. */
  max_price_eur: number | null;
  created_at: string;
  updated_at: string;
}

export interface AccessSettingsWithCatalogs extends AccessSettingsRecord {
  catalog_ids: string[];
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listAccessSettings(
  workspaceId: string,
): Promise<AccessSettingsRecord[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("access_settings")
    .select("id, public_id, workspace_id, bot_id, name, max_price_eur, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listAccessSettings: ${error.message}`);
  return (data ?? []).map(toRecord);
}

export async function getAccessSettingsById(
  id: string,
): Promise<AccessSettingsRecord | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("access_settings")
    .select("id, public_id, workspace_id, bot_id, name, max_price_eur, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) return null;
  return data ? toRecord(data) : null;
}

export async function getAccessSettingsWithCatalogs(
  id: string,
): Promise<AccessSettingsWithCatalogs | null> {
  const base = await getAccessSettingsById(id);
  if (!base) return null;
  const catalogIds = await getAccessSettingsCatalogIds(id);
  return { ...base, catalog_ids: catalogIds };
}

export async function createAccessSettings(input: {
  workspaceId: string;
  botId: string;
  name: string;
  /** NULL = no cap. */
  maxPriceEur: number | null;
}): Promise<AccessSettingsRecord> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("access_settings")
    .insert({
      public_id: generatePublicId("as"),
      workspace_id: input.workspaceId,
      bot_id: input.botId,
      name: input.name,
      max_price_eur: input.maxPriceEur,
    })
    .select("id, public_id, workspace_id, bot_id, name, max_price_eur, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(`createAccessSettings: ${error?.message ?? "unknown"}`);
  }
  return toRecord(data);
}

export async function updateAccessSettings(
  id: string,
  patch: { name?: string; maxPriceEur?: number | null },
): Promise<AccessSettingsRecord> {
  const supabase = await createServerClient();

  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.maxPriceEur !== undefined) fields.max_price_eur = patch.maxPriceEur;

  const { data, error } = await supabase
    .from("access_settings")
    .update(fields)
    .eq("id", id)
    .select("id, public_id, workspace_id, bot_id, name, max_price_eur, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(`updateAccessSettings: ${error?.message ?? "unknown"}`);
  }
  return toRecord(data);
}

export async function deleteAccessSettings(id: string): Promise<void> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("access_settings")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`deleteAccessSettings: ${error.message}`);
}

// ---------------------------------------------------------------------------
// access_settings_catalogs — membership
// ---------------------------------------------------------------------------

/**
 * Add catalogues to an access settings. Idempotent: existing rows are skipped.
 * Eligibility (marketplace status OR same workspace) is enforced by the
 * BEFORE INSERT trigger on `access_settings_catalogs`.
 */
export async function addCatalogsToAccessSettings(input: {
  accessSettingsId: string;
  catalogIds: string[];
}): Promise<number> {
  if (input.catalogIds.length === 0) return 0;

  const supabase = await createServerClient();

  const rows = input.catalogIds.map((catalogId) => ({
    access_settings_id: input.accessSettingsId,
    catalog_id: catalogId,
  }));

  const { data, error } = await supabase
    .from("access_settings_catalogs")
    .upsert(rows, { onConflict: "access_settings_id,catalog_id", ignoreDuplicates: true })
    .select("catalog_id");

  if (error) throw new Error(`addCatalogsToAccessSettings: ${error.message}`);
  return (data ?? []).length;
}

export async function removeCatalogFromAccessSettings(input: {
  accessSettingsId: string;
  catalogId: string;
}): Promise<void> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("access_settings_catalogs")
    .delete()
    .eq("access_settings_id", input.accessSettingsId)
    .eq("catalog_id", input.catalogId);

  if (error) throw new Error(`removeCatalogFromAccessSettings: ${error.message}`);
}

/**
 * Catalogue allowlist for one access settings — the authoritative set
 * consumed by `consumer.service.ts` at /licenses time.
 */
export async function getAccessSettingsCatalogIds(
  accessSettingsId: string,
): Promise<string[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("access_settings_catalogs")
    .select("catalog_id")
    .eq("access_settings_id", accessSettingsId);

  if (error) throw new Error(`getAccessSettingsCatalogIds: ${error.message}`);
  return (data ?? []).map((row) => row.catalog_id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toRecord(row: {
  id: string;
  public_id: string;
  workspace_id: string;
  bot_id: string;
  name: string;
  max_price_eur: number | null;
  created_at: string;
  updated_at: string;
}): AccessSettingsRecord {
  return {
    id: row.id,
    public_id: row.public_id,
    workspace_id: row.workspace_id,
    bot_id: row.bot_id,
    name: row.name,
    max_price_eur: row.max_price_eur == null ? null : Number(row.max_price_eur),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
