import { createServerClient } from "@/lib/db/supabase-server";
import type { Json } from "@/lib/db/types";
import type {
  CreateSearchConfigInput,
  UpdateSearchConfigInput,
} from "@/lib/validations/search-config.schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** SearchConfig with its linked catalog IDs. */
export interface SearchConfigItem {
  id: string;
  name: string;
  path_filters: Json;
  max_price_eur: number | null;
  total_budget_eur: number | null;
  max_results: number;
  catalog_ids: string[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new SearchConfig and link its catalogs.
 *
 * @param workspaceId - The consumer workspace creating the config
 * @param data - Validated input (name, catalog_ids, filters, budget, etc.)
 * @returns The created SearchConfig with catalog_ids
 */
export async function createSearchConfig(
  workspaceId: string,
  data: CreateSearchConfigInput
): Promise<SearchConfigItem> {
  const supabase = await createServerClient();

  // Insert the search config
  const { data: config, error } = await supabase
    .from("search_configs")
    .insert({
      workspace_id: workspaceId,
      name: data.name,
      path_filters: data.path_filters as unknown as Json,
      max_price_eur: data.max_price_eur ?? null,
      total_budget_eur: data.total_budget_eur ?? null,
      max_results: data.max_results,
    })
    .select("id, name, path_filters, max_price_eur, total_budget_eur, max_results, created_at, updated_at")
    .single();

  if (error || !config) {
    throw new Error(`Failed to create search config: ${error?.message}`);
  }

  // Link catalogs via the junction table
  if (data.catalog_ids.length > 0) {
    const links = data.catalog_ids.map((catalogId) => ({
      search_config_id: config.id,
      catalog_id: catalogId,
    }));

    const { error: linkError } = await supabase
      .from("search_config_catalogs")
      .insert(links);

    if (linkError) {
      throw new Error(`Failed to link catalogs: ${linkError.message}`);
    }
  }

  return {
    id: config.id,
    name: config.name,
    path_filters: config.path_filters,
    max_price_eur: config.max_price_eur ? Number(config.max_price_eur) : null,
    total_budget_eur: config.total_budget_eur ? Number(config.total_budget_eur) : null,
    max_results: config.max_results,
    catalog_ids: data.catalog_ids,
    created_at: config.created_at!,
    updated_at: config.updated_at!,
  };
}

/**
 * List all SearchConfigs for a workspace.
 *
 * @param workspaceId - The workspace to list configs for
 * @returns Array of SearchConfigs with their catalog_ids
 */
export async function getSearchConfigs(
  workspaceId: string
): Promise<SearchConfigItem[]> {
  const supabase = await createServerClient();

  const { data: configs, error } = await supabase
    .from("search_configs")
    .select("id, name, path_filters, max_price_eur, total_budget_eur, max_results, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list search configs: ${error.message}`);
  }

  if (!configs || configs.length === 0) return [];

  // Fetch catalog links for all configs in one query
  const configIds = configs.map((c) => c.id);
  const { data: allLinks } = await supabase
    .from("search_config_catalogs")
    .select("search_config_id, catalog_id")
    .in("search_config_id", configIds);

  // Group links by config ID
  const linkMap = new Map<string, string[]>();
  for (const link of allLinks ?? []) {
    const existing = linkMap.get(link.search_config_id) ?? [];
    existing.push(link.catalog_id);
    linkMap.set(link.search_config_id, existing);
  }

  return configs.map((config) => ({
    id: config.id,
    name: config.name,
    path_filters: config.path_filters,
    max_price_eur: config.max_price_eur ? Number(config.max_price_eur) : null,
    total_budget_eur: config.total_budget_eur ? Number(config.total_budget_eur) : null,
    max_results: config.max_results,
    catalog_ids: linkMap.get(config.id) ?? [],
    created_at: config.created_at!,
    updated_at: config.updated_at!,
  }));
}

/**
 * Get a single SearchConfig by ID.
 *
 * @param id - The SearchConfig ID
 * @param workspaceId - The workspace to check ownership
 * @returns The SearchConfig, or null if not found
 */
export async function getSearchConfigById(
  id: string,
  workspaceId: string
): Promise<SearchConfigItem | null> {
  const supabase = await createServerClient();

  const { data: config, error } = await supabase
    .from("search_configs")
    .select("id, name, path_filters, max_price_eur, total_budget_eur, max_results, created_at, updated_at")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !config) return null;

  // Fetch linked catalogs
  const { data: links } = await supabase
    .from("search_config_catalogs")
    .select("catalog_id")
    .eq("search_config_id", config.id);

  return {
    id: config.id,
    name: config.name,
    path_filters: config.path_filters,
    max_price_eur: config.max_price_eur ? Number(config.max_price_eur) : null,
    total_budget_eur: config.total_budget_eur ? Number(config.total_budget_eur) : null,
    max_results: config.max_results,
    catalog_ids: (links ?? []).map((l) => l.catalog_id),
    created_at: config.created_at!,
    updated_at: config.updated_at!,
  };
}

/**
 * Update a SearchConfig and optionally replace its catalog links.
 *
 * @param id - The SearchConfig ID
 * @param workspaceId - The workspace to check ownership
 * @param data - Validated partial update input
 * @returns The updated SearchConfig, or null if not found
 */
export async function updateSearchConfig(
  id: string,
  workspaceId: string,
  data: UpdateSearchConfigInput
): Promise<SearchConfigItem | null> {
  const supabase = await createServerClient();

  // Verify the config exists and belongs to the workspace
  const existing = await getSearchConfigById(id, workspaceId);
  if (!existing) return null;

  // Build update object (only provided fields)
  const updateFields: Record<string, unknown> = {};
  if (data.name !== undefined) updateFields.name = data.name;
  if (data.path_filters !== undefined) updateFields.path_filters = data.path_filters;
  if (data.max_price_eur !== undefined) updateFields.max_price_eur = data.max_price_eur;
  if (data.total_budget_eur !== undefined) updateFields.total_budget_eur = data.total_budget_eur;
  if (data.max_results !== undefined) updateFields.max_results = data.max_results;

  if (Object.keys(updateFields).length > 0) {
    updateFields.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from("search_configs")
      .update(updateFields)
      .eq("id", id)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error(`Failed to update search config: ${error.message}`);
    }
  }

  // Replace catalog links if provided
  if (data.catalog_ids !== undefined) {
    // Delete old links
    await supabase
      .from("search_config_catalogs")
      .delete()
      .eq("search_config_id", id);

    // Insert new links
    if (data.catalog_ids.length > 0) {
      const links = data.catalog_ids.map((catalogId) => ({
        search_config_id: id,
        catalog_id: catalogId,
      }));

      const { error: linkError } = await supabase
        .from("search_config_catalogs")
        .insert(links);

      if (linkError) {
        throw new Error(`Failed to link catalogs: ${linkError.message}`);
      }
    }
  }

  return getSearchConfigById(id, workspaceId);
}

/**
 * Delete a SearchConfig (cascade removes junction rows).
 *
 * @param id - The SearchConfig ID
 * @param workspaceId - The workspace to check ownership
 * @returns true if deleted, false if not found
 */
export async function deleteSearchConfig(
  id: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const existing = await getSearchConfigById(id, workspaceId);
  if (!existing) return false;

  const { error } = await supabase
    .from("search_configs")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to delete search config: ${error.message}`);
  }

  return true;
}
