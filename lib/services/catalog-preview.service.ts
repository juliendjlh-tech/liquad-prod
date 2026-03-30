// ---------------------------------------------------------------------------
// Catalog filter_rules preview
//
// Evaluates filter_rules against workspace sources to show which URLs match.
// Used by the catalog create/edit UI for real-time feedback.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import type { FilterRules } from "@/lib/validations/catalog.schema";
import { matchContentAgainstRules } from "@/lib/validations/catalog.schema";

// ---------------------------------------------------------------------------
// Types
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch ALL source rows from a workspace, paginating through Supabase's
 * default 1000-row limit.
 */
async function fetchAllSources(
  workspaceId: string,
  columns: string
): Promise<Array<Record<string, unknown>>> {
  const supabase = await createServerClient();
  const PAGE_SIZE = 1000;
  const allRows: Array<Record<string, unknown>> = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sources")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch sources: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    const rows = data as unknown as Array<Record<string, unknown>>;
    allRows.push(...rows);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Build a map of domain_id -> hostname for a workspace.
 */
async function buildDomainMap(
  workspaceId: string
): Promise<Map<string, string>> {
  const supabase = await createServerClient();
  const { data: domains } = await supabase
    .from("domains")
    .select("id, domain")
    .eq("workspace_id", workspaceId);

  const map = new Map<string, string>();
  for (const d of domains ?? []) {
    map.set(d.id, d.domain);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Preview which sources match given filter rules.
 * Uses structured matching (no regex).
 */
export async function previewCatalogMatch(
  workspaceId: string,
  filterRules: FilterRules,
  page = 1,
  limit = 50
): Promise<PreviewResult> {
  // Fetch all sources with domain info
  const sources = (await fetchAllSources(
    workspaceId,
    "id, source_url, title"
  )) as Array<{ id: string; source_url: string; title: string | null }>;
  const totalContents = sources.length;

  // Build domain map
  const domainMap = await buildDomainMap(workspaceId);

  // Match each source and track per-domain stats
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
      const hostname = url.hostname;
      const pathname = url.pathname;

      // Find domain_id for this hostname
      let sourceDomainId: string | undefined;
      for (const [id, domain] of domainMap) {
        if (domain === hostname) {
          sourceDomainId = id;
          break;
        }
      }

      // Update per-domain total
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

  // Generate warnings
  const warnings: string[] = [];
  if (matchedCount === 0) {
    warnings.push("no_match");
  }
  if (totalContents > 0 && matchedCount / totalContents > 0.8) {
    warnings.push("too_broad");
  }

  // Check for domains with 0 matches
  for (const rule of filterRules.domain_rules) {
    const stats = perDomainStats.get(rule.domain_id);
    if (stats && stats.matched === 0) {
      const hostname = domainMap.get(rule.domain_id) ?? rule.domain_id;
      warnings.push(`domain_no_match:${hostname}`);
    }
  }

  // Paginate matched sources (show matched first)
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
