// ---------------------------------------------------------------------------
// Catalog filter_rules preview
//
// Evaluates filter_rules against workspace sources to show which URLs match.
// Used by the catalog create/edit UI for real-time feedback.
// ---------------------------------------------------------------------------

import type { FilterRules } from "@/lib/validations/catalog.schema";
import { matchContentAgainstRules } from "@/lib/validations/catalog.schema";
import { getDomainMap } from "@/lib/db/queries/domains";
import { getAllSourcesCustom } from "@/lib/db/queries/sources";

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
  // Fetch all sources with domain info (shared query module)
  const sources = await getAllSourcesCustom<{
    id: string;
    source_url: string;
    title: string | null;
  }>(workspaceId, "id, source_url, title");
  const totalContents = sources.length;

  // Build domain map (shared query module)
  const domainMap = await getDomainMap(workspaceId);

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
