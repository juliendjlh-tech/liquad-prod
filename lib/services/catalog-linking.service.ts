// ---------------------------------------------------------------------------
// Catalog linking service
//
// Diff-based materialization of (catalog → indexed sources) links into
// `catalog_sources`. Consumed by /licenses to resolve URL → catalog.
//
// Triggered when:
//   - filter_rules of a catalog change (catalog.service.updateCatalog)
//   - new indexed sources are added to a workspace (sitemap import path)
//
// Replaces the broader pipeline.service that also handled RAG embedding —
// scraping/RAG were removed for MVP simplification.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { matchContentAgainstRules } from "@/lib/validations/catalog.schema";
import type { FilterRules } from "@/lib/validations/catalog.schema";
import { getDomainMap } from "@/lib/db/queries/domains";
import { getAllSourcesWithDomain } from "@/lib/db/queries/sources";
import { getCatalogSources } from "@/lib/db/queries/catalogs";

const BATCH = 1000;
const PAGE_SIZE = 1000;

/**
 * Full sync: reconciles `catalog_sources` rows for one (or all) catalog(s) in
 * a workspace against the catalog's current filter_rules.
 *
 * Pass `catalogId` to sync a single catalog; omit it to sync all catalogs of
 * the workspace.
 */
export async function syncCatalogSources(
  workspaceId: string,
  catalogId?: string
): Promise<void> {
  const supabase = await createServerClient();

  let catalogQuery = supabase
    .from("catalogs")
    .select("id, filter_rules, workspace_id")
    .eq("workspace_id", workspaceId);

  if (catalogId) {
    catalogQuery = catalogQuery.eq("id", catalogId);
  }

  const { data: catalogs, error: catErr } = await catalogQuery;
  if (catErr || !catalogs || catalogs.length === 0) return;

  const domainMap = await getDomainMap(workspaceId);
  if (domainMap.size === 0) return;

  const allSources = await getAllSourcesWithDomain(workspaceId);

  for (const catalog of catalogs) {
    const filterRules = catalog.filter_rules as unknown as FilterRules;

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

    const existingLinks = await getCatalogSources([catalog.id]);
    const existingIds = new Set<string>(existingLinks.map((l) => l.indexed_source_id));

    const toInsert: string[] = [];
    for (const id of expectedIds) {
      if (!existingIds.has(id)) toInsert.push(id);
    }

    const toDelete: string[] = [];
    for (const id of existingIds) {
      if (!expectedIds.has(id)) toDelete.push(id);
    }

    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH);
      await supabase
        .from("catalog_sources")
        .delete()
        .eq("catalog_id", catalog.id)
        .in("indexed_source_id", batch);
    }

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH).map((indexedSourceId) => ({
        catalog_id: catalog.id,
        indexed_source_id: indexedSourceId,
      }));
      await supabase
        .from("catalog_sources")
        .upsert(batch, { onConflict: "catalog_id,indexed_source_id" });
    }
  }
}

/**
 * Incremental link: when new indexed sources are added (sitemap import), link
 * them to every catalog of the workspace whose filter_rules match. INSERT-only;
 * never deletes existing links.
 */
export async function linkNewSources(
  workspaceId: string,
  indexedSourceIds: string[]
): Promise<void> {
  if (indexedSourceIds.length === 0) return;

  const supabase = await createServerClient();

  const { data: catalogs, error: catErr } = await supabase
    .from("catalogs")
    .select("id, filter_rules, workspace_id")
    .eq("workspace_id", workspaceId);

  if (catErr || !catalogs || catalogs.length === 0) return;

  const domainMap = await getDomainMap(workspaceId);
  if (domainMap.size === 0) return;

  const sources: Array<{ id: string; source_url: string; domain_id: string }> = [];

  for (let i = 0; i < indexedSourceIds.length; i += PAGE_SIZE) {
    const batch = indexedSourceIds.slice(i, i + PAGE_SIZE);
    const { data } = await supabase
      .from("indexed_sources")
      .select("id, source_url, domain_id")
      .in("id", batch);

    if (data) sources.push(...data);
  }

  if (sources.length === 0) return;

  for (const catalog of catalogs) {
    const filterRules = catalog.filter_rules as unknown as FilterRules;

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

    for (let i = 0; i < matchedIds.length; i += BATCH) {
      const batch = matchedIds.slice(i, i + BATCH).map((indexedSourceId) => ({
        catalog_id: catalog.id,
        indexed_source_id: indexedSourceId,
      }));
      await supabase
        .from("catalog_sources")
        .upsert(batch, { onConflict: "catalog_id,indexed_source_id" });
    }
  }
}
