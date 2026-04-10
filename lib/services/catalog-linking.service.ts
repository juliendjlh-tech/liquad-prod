// ---------------------------------------------------------------------------
// Catalog ↔ Source Linking
//
// Two modes:
//   - linkNewSources()      — incremental, insert-only (post-scrape)
//   - syncCatalogSources()  — full diff with deletes (post filter_rules change)
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import type { FilterRules } from "@/lib/validations/catalog.schema";
import { matchContentAgainstRules } from "@/lib/validations/catalog.schema";
import { getDomainMap } from "@/lib/db/queries/domains";
import { getAllSourcesWithDomain } from "@/lib/db/queries/sources";
import { getCatalogSources } from "@/lib/db/queries/catalogs";

/** Page size for Supabase range queries in batch operations. */
const PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Incremental linking (post-scrape)
// ---------------------------------------------------------------------------

/**
 * Incrementally link newly indexed sources to RAG-enabled catalogs.
 *
 * INSERT-ONLY — never deletes existing links. Safe to call after each
 * micro-batch or at pipeline finalization.
 *
 * 1. Fetch the given source rows (source_url, domain_id)
 * 2. For each RAG-enabled catalog, match sources against filter_rules
 * 3. Upsert matching rows into catalog_sources
 * 4. Recount rag_source_count via COUNT(*)
 *
 * @param workspaceId - The workspace that owns the sources
 * @param sourceIds   - The source IDs to evaluate for linking
 */
export async function linkNewSources(
  workspaceId: string,
  sourceIds: string[]
): Promise<void> {
  if (sourceIds.length === 0) return;

  const supabase = await createServerClient();

  // Fetch RAG-enabled catalogs for this workspace
  const { data: catalogs, error: catErr } = await supabase
    .from("catalogs")
    .select("id, filter_rules, workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("rag_enabled", true);

  if (catErr || !catalogs || catalogs.length === 0) return;

  // Build domain_id → hostname map (shared query module)
  const domainMap = await getDomainMap(workspaceId);
  if (domainMap.size === 0) return;

  // Fetch source details for the given IDs in pages
  const PAGE_SIZE = 1000;
  const sources: Array<{ id: string; source_url: string; domain_id: string }> = [];

  for (let i = 0; i < sourceIds.length; i += PAGE_SIZE) {
    const batch = sourceIds.slice(i, i + PAGE_SIZE);
    const { data } = await supabase
      .from("sources")
      .select("id, source_url, domain_id")
      .in("id", batch);

    if (data) sources.push(...data);
  }

  if (sources.length === 0) return;

  const BATCH = 1000;

  for (const catalog of catalogs) {
    const filterRules = catalog.filter_rules as unknown as FilterRules;

    // Match sources against this catalog's filter_rules
    const matchedIds: string[] = [];
    for (const source of sources) {
      const hostname = domainMap.get(source.domain_id);
      if (!hostname) continue;
      try {
        const pathname = new URL(source.source_url).pathname;
        if (matchContentAgainstRules(hostname, pathname, filterRules, domainMap)) {
          matchedIds.push(source.id);
        }
      } catch {
        // Skip invalid URLs
      }
    }

    // Upsert matched links (idempotent — safe to re-run)
    for (let i = 0; i < matchedIds.length; i += BATCH) {
      const batch = matchedIds.slice(i, i + BATCH).map((sourceId) => ({
        catalog_id: catalog.id,
        source_id: sourceId,
      }));
      await supabase
        .from("catalog_sources")
        .upsert(batch, { onConflict: "catalog_id,source_id" });
    }

    // Recount rag_source_count from source of truth
    if (matchedIds.length > 0) {
      const { count } = await supabase
        .from("catalog_sources")
        .select("*", { count: "exact", head: true })
        .eq("catalog_id", catalog.id);

      await supabase
        .from("catalogs")
        .update({ rag_source_count: count ?? 0 })
        .eq("id", catalog.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Full sync (post filter_rules change, maintenance)
// ---------------------------------------------------------------------------

/**
 * Full sync: diff-based linking of ALL workspace sources to catalogs.
 *
 * Computes the complete expected state and applies minimal INSERT/DELETE:
 *   1. Fetch ALL sources in this workspace
 *   2. For each catalog, compute expected set (filter_rules match)
 *   3. Fetch existing catalog_sources links
 *   4. Diff: toInsert = expected − existing, toDelete = existing − expected
 *   5. Apply minimal operations
 *
 * Use when filter_rules change, a domain is deleted, or for maintenance.
 * For post-scrape linking of new sources, use linkNewSources() instead.
 *
 * @param workspaceId - The workspace to process
 * @param catalogId - Optional: process only this catalog
 */
export async function syncCatalogSources(
  workspaceId: string,
  catalogId?: string
): Promise<void> {
  const supabase = await createServerClient();

  // Fetch RAG-enabled catalogs (all or just the one specified)
  let catalogQuery = supabase
    .from("catalogs")
    .select("id, filter_rules, workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("rag_enabled", true);

  if (catalogId) {
    catalogQuery = catalogQuery.eq("id", catalogId);
  }

  const { data: catalogs, error: catErr } = await catalogQuery;
  if (catErr || !catalogs || catalogs.length === 0) return;

  // Build domain_id → hostname map for filter_rules matching (shared query module)
  const domainMap = await getDomainMap(workspaceId);
  if (domainMap.size === 0) return;

  // Fetch all sources with domain info (shared query module)
  const allSources = await getAllSourcesWithDomain(workspaceId);

  // Process each catalog with diff
  for (const catalog of catalogs) {
    const filterRules = catalog.filter_rules as unknown as FilterRules;

    // --- Expected set: source IDs that match filter_rules ---
    const expectedIds = new Set<string>();
    for (const source of allSources) {
      const hostname = domainMap.get(source.domain_id);
      if (!hostname) continue;
      try {
        const pathname = new URL(source.source_url).pathname;
        if (matchContentAgainstRules(hostname, pathname, filterRules, domainMap)) {
          expectedIds.add(source.id);
        }
      } catch {
        // Skip invalid URLs
      }
    }

    // --- Existing set: source IDs currently linked ---
    const existingLinks = await getCatalogSources([catalog.id]);
    const existingIds = new Set<string>(existingLinks.map((l) => l.source_id));

    // --- Diff ---
    const toInsert: string[] = [];
    for (const id of expectedIds) {
      if (!existingIds.has(id)) toInsert.push(id);
    }

    const toDelete: string[] = [];
    for (const id of existingIds) {
      if (!expectedIds.has(id)) toDelete.push(id);
    }

    // Safety guard: log warning if deleting far more than inserting
    if (toDelete.length > 0 && toDelete.length > toInsert.length * 2 && existingIds.size > 100) {
      console.warn(
        `[syncCatalogSources] catalog ${catalog.id}: deleting ${toDelete.length} vs inserting ${toInsert.length} — possible filter_rules issue`
      );
    }

    // --- Apply deletes in batches ---
    const BATCH = 1000;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH);
      await supabase
        .from("catalog_sources")
        .delete()
        .eq("catalog_id", catalog.id)
        .in("source_id", batch);
    }

    // --- Apply inserts in batches (upsert for idempotency) ---
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH).map((sourceId) => ({
        catalog_id: catalog.id,
        source_id: sourceId,
      }));
      await supabase
        .from("catalog_sources")
        .upsert(batch, { onConflict: "catalog_id,source_id" });
    }

    // --- Update rag_source_count ---
    await supabase
      .from("catalogs")
      .update({ rag_source_count: expectedIds.size })
      .eq("id", catalog.id);
  }
}
