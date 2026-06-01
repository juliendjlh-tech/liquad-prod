// ---------------------------------------------------------------------------
// Catalog service — CRUD operations
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import type { Json } from "@/lib/db/types";
import type {
  CreateCatalogInput,
  UpdateCatalogInput,
  FilterRules,
} from "@/lib/validations/catalog.schema";
import { matchContentAgainstRules } from "@/lib/validations/catalog.schema";
import { syncCatalogSources } from "@/lib/services/catalog-linking.service";
import { getDomainMap } from "@/lib/db/queries/domains";
import { canonicalizeHostname } from "@/lib/utils/hostname";
import { generatePublicId } from "@/lib/ids";
import { getAllSourceUrls, getAllSourcesCustom } from "@/lib/db/queries/sources";
import { getWorkspaceBots, getCatalogBots } from "@/lib/db/queries/agents";
import { getCatalogs as queryCatalogs } from "@/lib/db/queries/catalogs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogListItem {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  filter_rules: FilterRules;
  price_eur: number;
  status: string;
  bot_count: number;
  content_count: number;
  created_at: string;
}

export interface CatalogDetail {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  filter_rules: FilterRules;
  price_eur: number;
  status: string;
  created_at: string;
  bots: Array<{
    id: string;
    public_id: string;
    name: string;
    ua_pattern: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count sources matching filter_rules using structured matching.
 */
function countMatchedSources(
  sources: Array<{ source_url: string }>,
  filterRules: FilterRules,
  domainMap: Map<string, string>
): number {
  let count = 0;
  for (const s of sources) {
    try {
      const url = new URL(s.source_url);
      if (matchContentAgainstRules(url.hostname, url.pathname, filterRules, domainMap)) {
        count++;
      }
    } catch {
      // Skip invalid URLs
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new catalog and link authorized agents.
 * New catalogs always start with status "inactive".
 */
export async function createCatalog(
  workspaceId: string,
  data: CreateCatalogInput
): Promise<CatalogDetail> {
  const supabase = await createServerClient();

  // Validate bot_ids are linked to the workspace via workspace_bots
  if (data.bot_ids.length > 0) {
    const wsBots = await getWorkspaceBots(workspaceId);
    const wsBotIds = new Set(wsBots.map((a) => a.id));
    if (!data.bot_ids.every((id) => wsBotIds.has(id))) {
      throw new Error("INVALID_BOT_IDS");
    }
  }

  // Validate domain_ids belong to the workspace
  const domainIds = data.filter_rules.domain_rules.map((r) => r.domain_id);
  if (domainIds.length > 0) {
    const { data: validDomains } = await supabase
      .from("domains")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("id", domainIds);

    if ((validDomains?.length ?? 0) !== new Set(domainIds).size) {
      throw new Error("INVALID_DOMAIN_IDS");
    }
  }

  // Insert the catalog
  const { data: catalog, error: catalogError } = await supabase
    .from("catalogs")
    .insert({
      public_id: generatePublicId("cat"),
      workspace_id: workspaceId,
      name: data.name,
      description: data.description ?? null,
      filter_rules: data.filter_rules as unknown as Json,
      price_eur: data.price_eur,
      status: "inactive",
    })
    .select("id, public_id, name, description, filter_rules, price_eur, status, created_at")
    .single();

  if (catalogError || !catalog) {
    throw new Error(`Failed to create catalog: ${catalogError?.message}`);
  }

  // Link bots via catalog_bots junction table
  if (data.bot_ids.length > 0) {
    const junctionRows = data.bot_ids.map((botId) => ({
      catalog_id: catalog.id,
      bot_id: botId,
    }));

    const { error: linkError } = await supabase
      .from("catalog_bots")
      .insert(junctionRows);

    if (linkError) {
      throw new Error(`Failed to link bots: ${linkError.message}`);
    }
  }

  return getCatalogById(catalog.id, workspaceId) as Promise<CatalogDetail>;
}

/**
 * List all catalogs for a workspace with agent count.
 * Ordered by created_at ASC (first match wins).
 */
export async function getCatalogs(
  workspaceId: string
): Promise<CatalogListItem[]> {
  const catalogs = await queryCatalogs([], { workspaceId });

  // Fetch all sources and domain map for filter_rules matching
  const sourceUrls = await getAllSourceUrls(workspaceId);
  const sources = sourceUrls.map((url) => ({ source_url: url }));
  const domainMap = await getDomainMap(workspaceId);

  // Batch-fetch bot counts for all catalogs in one query
  const catalogIds = catalogs.map((c) => c.id);
  const allCatalogBots = await getCatalogBots(catalogIds);
  const botCountMap = new Map<string, number>();
  for (const link of allCatalogBots) {
    botCountMap.set(link.catalog_id, (botCountMap.get(link.catalog_id) ?? 0) + 1);
  }

  return catalogs.map((catalog) => {
    const filterRules = catalog.filter_rules as unknown as FilterRules;
    const contentCount = countMatchedSources(sources, filterRules, domainMap);

    return {
      id: catalog.id,
      public_id: catalog.public_id,
      name: catalog.name,
      description: catalog.description,
      filter_rules: filterRules,
      price_eur: catalog.price_eur,
      status: catalog.status,
      bot_count: botCountMap.get(catalog.id) ?? 0,
      content_count: contentCount,
      created_at: catalog.created_at!,
    };
  });
}

/**
 * Get a single catalog with full agent details.
 */
export async function getCatalogById(
  catalogId: string,
  workspaceId: string
): Promise<CatalogDetail | null> {
  const results = await queryCatalogs([catalogId], { workspaceId });
  const catalog = results[0];
  if (!catalog) return null;

  // Fetch linked bots in a single query
  const links = await getCatalogBots([catalogId]);
  const bots = links.map((l) => ({
    id: l.bot.id,
    public_id: l.bot.public_id,
    name: l.bot.name,
    ua_pattern: l.bot.ua_pattern,
  }));

  return {
    id: catalog.id,
    public_id: catalog.public_id,
    name: catalog.name,
    description: catalog.description,
    filter_rules: catalog.filter_rules as unknown as FilterRules,
    price_eur: catalog.price_eur,
    status: catalog.status,
    created_at: catalog.created_at!,
    bots,
  };
}

/**
 * Update a catalog and optionally replace agent links.
 */
export async function updateCatalog(
  catalogId: string,
  workspaceId: string,
  data: UpdateCatalogInput
): Promise<CatalogDetail | null> {
  const supabase = await createServerClient();

  const existing = await getCatalogById(catalogId, workspaceId);
  if (!existing) {
    return null;
  }

  // If bot_ids provided, validate and replace
  if (data.bot_ids !== undefined) {
    if (data.bot_ids.length > 0) {
      const wsBots = await getWorkspaceBots(workspaceId);
      const wsBotIds = new Set(wsBots.map((a) => a.id));
      if (!data.bot_ids.every((id) => wsBotIds.has(id))) {
        throw new Error("INVALID_BOT_IDS");
      }
    }

    await supabase
      .from("catalog_bots")
      .delete()
      .eq("catalog_id", catalogId);

    if (data.bot_ids.length > 0) {
      await supabase.from("catalog_bots").insert(
        data.bot_ids.map((botId) => ({
          catalog_id: catalogId,
          bot_id: botId,
        }))
      );
    }
  }

  // Validate domain_ids if filter_rules provided
  if (data.filter_rules) {
    const domainIds = data.filter_rules.domain_rules.map((r) => r.domain_id);
    if (domainIds.length > 0) {
      const { data: validDomains } = await supabase
        .from("domains")
        .select("id")
        .eq("workspace_id", workspaceId)
        .in("id", domainIds);

      if ((validDomains?.length ?? 0) !== new Set(domainIds).size) {
        throw new Error("INVALID_DOMAIN_IDS");
      }
    }
  }

  // Build update object (only provided fields)
  const updateFields: Record<string, unknown> = {};
  if (data.name !== undefined) updateFields.name = data.name;
  if (data.description !== undefined) updateFields.description = data.description;
  if (data.filter_rules !== undefined) updateFields.filter_rules = data.filter_rules;
  if (data.price_eur !== undefined) updateFields.price_eur = data.price_eur;
  if (data.status !== undefined) updateFields.status = data.status;

  if (Object.keys(updateFields).length > 0) {
    const { error } = await supabase
      .from("catalogs")
      .update(updateFields)
      .eq("id", catalogId)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error(`Failed to update catalog: ${error.message}`);
    }
  }

  // Re-materialize catalog_sources when filter_rules change. The /licenses
  // URL→catalog lookup reads this junction directly.
  if (data.filter_rules !== undefined) {
    await syncCatalogSources(workspaceId, catalogId);
  }

  return getCatalogById(catalogId, workspaceId) as Promise<CatalogDetail>;
}

/**
 * Delete a catalog (cascade removes catalog_bots + catalog_sources).
 */
export async function deleteCatalog(
  catalogId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const existing = await getCatalogById(catalogId, workspaceId);
  if (!existing) {
    return false;
  }

  const { error } = await supabase
    .from("catalogs")
    .delete()
    .eq("id", catalogId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to delete catalog: ${error.message}`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Preview (absorbed from catalog-preview.service.ts)
// ---------------------------------------------------------------------------

export interface PreviewResult {
  matched_count: number;
  total_contents: number;
  per_domain: Array<{
    domain: string;
    domain_id: string;
    matched: number;
    total: number;
  }>;
  matched_contents: Array<{
    id: string;
    source_url: string;
    title: string | null;
    matched: boolean;
  }>;
  warnings: string[];
  page: number;
  limit: number;
  total_pages: number;
}

/**
 * Preview which sources match given filter rules.
 */
export async function previewCatalogMatch(
  workspaceId: string,
  filterRules: FilterRules,
  page = 1,
  limit = 50
): Promise<PreviewResult> {
  const sources = await getAllSourcesCustom<{
    id: string;
    source_url: string;
    title: string | null;
  }>(workspaceId, "id, source_url, title");
  const totalContents = sources.length;

  const domainMap = await getDomainMap(workspaceId);

  const perDomainStats = new Map<
    string,
    { domain: string; domain_id: string; matched: number; total: number }
  >();
  const matchedSources: Array<{
    id: string;
    source_url: string;
    title: string | null;
    matched: boolean;
  }> = [];

  for (const source of sources) {
    try {
      const url = new URL(source.source_url);
      const hostname = canonicalizeHostname(url.hostname);
      const pathname = url.pathname;

      let sourceDomainId: string | undefined;
      for (const [id, domain] of domainMap) {
        if (domain === hostname) {
          sourceDomainId = id;
          break;
        }
      }

      if (sourceDomainId) {
        if (!perDomainStats.has(sourceDomainId)) {
          perDomainStats.set(sourceDomainId, {
            domain: hostname,
            domain_id: sourceDomainId,
            matched: 0,
            total: 0,
          });
        }
        perDomainStats.get(sourceDomainId)!.total++;
      }

      const isMatched = matchContentAgainstRules(
        hostname,
        pathname,
        filterRules,
        domainMap
      );

      if (isMatched && sourceDomainId) {
        perDomainStats.get(sourceDomainId)!.matched++;
      }

      matchedSources.push({
        id: source.id,
        source_url: source.source_url,
        title: source.title,
        matched: isMatched,
      });
    } catch {
      // Skip invalid URLs
    }
  }

  const matched = matchedSources.filter((s) => s.matched);
  const matchedCount = matched.length;

  const warnings: string[] = [];
  if (matchedCount === 0) {
    warnings.push("no_match");
  }
  if (totalContents > 0 && matchedCount / totalContents > 0.8) {
    warnings.push("too_broad");
  }

  for (const rule of filterRules.domain_rules) {
    const stats = perDomainStats.get(rule.domain_id);
    if (stats && stats.matched === 0) {
      const hostname = domainMap.get(rule.domain_id) ?? rule.domain_id;
      warnings.push(`domain_no_match:${hostname}`);
    }
  }

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  const paginatedSources = matched.slice(offset, offset + safeLimit);

  return {
    matched_count: matchedCount,
    total_contents: totalContents,
    per_domain: [...perDomainStats.values()],
    matched_contents: paginatedSources,
    warnings,
    page: safePage,
    limit: safeLimit,
    total_pages: Math.ceil(matchedCount / safeLimit),
  };
}
