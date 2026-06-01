// ---------------------------------------------------------------------------
// Catalog query module
//
// Centralizes queries for catalogs and the catalog_sources junction table.
// Replaces duplicate inline queries across catalog, sdk-rules, and
// catalog-linking services.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogRecord {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  filter_rules: unknown;
  price_eur: number;
  /** Publisher-controlled token validity in minutes. Null = use default (60). */
  ttl_minutes: number | null;
  status: string;
  workspace_id: string;
  created_at: string | null;
}

export interface GetCatalogsOptions {
  maxPriceEur?: number;
  status?: string;
  workspaceId?: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch catalogs by IDs with optional filters.
 *
 * If `catalogIds` is empty, no ID filter is applied (returns all catalogs
 * matching the other filters). Results are ordered by created_at ASC.
 */
export async function getCatalogs(
  catalogIds: string[],
  options?: GetCatalogsOptions
): Promise<CatalogRecord[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("catalogs")
    .select("id, public_id, name, description, filter_rules, price_eur, ttl_minutes, status, workspace_id, created_at")
    .order("created_at", { ascending: true });

  if (catalogIds.length > 0) {
    query = query.in("id", catalogIds);
  }
  if (options?.workspaceId) {
    query = query.eq("workspace_id", options.workspaceId);
  }
  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.maxPriceEur !== undefined) {
    query = query.lte("price_eur", options.maxPriceEur);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch catalogs: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    ...row,
    price_eur: Number(row.price_eur),
  })) as CatalogRecord[];
}

/**
 * Fetch catalog_sources links for a set of indexed source IDs.
 * Reverse lookup: given indexed sources, find which catalogs they belong to.
 */
export async function getCatalogIdsBySourceIds(
  indexedSourceIds: string[]
): Promise<Array<{ catalog_id: string; indexed_source_id: string }>> {
  if (indexedSourceIds.length === 0) return [];

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("catalog_sources")
    .select("catalog_id, indexed_source_id")
    .in("indexed_source_id", indexedSourceIds);

  if (error) throw new Error(`Failed to fetch catalog sources by indexed source IDs: ${error.message}`);
  return data ?? [];
}

/**
 * Fetch all catalog_sources links for a set of catalog IDs.
 *
 * Paginates through Supabase's row limit (1000 per request).
 */
export async function getCatalogSources(
  catalogIds: string[]
): Promise<Array<{ catalog_id: string; indexed_source_id: string }>> {
  if (catalogIds.length === 0) return [];

  const supabase = await createServerClient();
  const rows: Array<{ catalog_id: string; indexed_source_id: string }> = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("catalog_sources")
      .select("catalog_id, indexed_source_id")
      .in("catalog_id", catalogIds)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch catalog sources: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}
