// ---------------------------------------------------------------------------
// Sitemap Import service
//
// Handles fetching, parsing, and importing URLs from XML sitemaps.
// Supports both standard <urlset> sitemaps and <sitemapindex> (nested).
//
// Extracted from content.service.ts for single-responsibility.
// ---------------------------------------------------------------------------

import { XMLParser } from "fast-xml-parser";
import { createServerClient } from "@/lib/db/supabase-server";
import { evaluatePathRule, type PathRule } from "@/lib/validations/catalog.schema";
import { ensureDomainExists } from "@/lib/services/domain-crud.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

export interface ImportResult {
  imported: number;
  upserted: number;
  /** All filtered URLs (before dedup). Used to populate import_jobs.urls_to_index. */
  filteredUrls: string[];
}

export interface ImportOptions {
  pathRules?: PathRule[];
  pathLogic?: "AND" | "OR";
  maxPages?: number;
}

// ---------------------------------------------------------------------------
// XML Parser
// ---------------------------------------------------------------------------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === "url" || name === "sitemap",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the domain (hostname) from a full URL string.
 */
export function extractDomain(url: string): string {
  return new URL(url).hostname;
}

// ---------------------------------------------------------------------------
// Sitemap Parsing
// ---------------------------------------------------------------------------

/**
 * Fetch and parse a sitemap.xml URL.
 *
 * Supports both standard <urlset> sitemaps and <sitemapindex> (nested).
 * For sitemap index: recursively fetches each nested sitemap
 * (max 50 nested sitemaps, max 50k total entries, 5 concurrent fetches).
 *
 * @param sitemapUrl - The URL of the sitemap to fetch
 * @returns Array of sitemap entries with loc and optional lastmod
 * @throws Error with "FETCH_FAILED" if HTTP fetch fails
 * @throws Error with "INVALID_SITEMAP" if XML parsing fails
 */
export async function fetchAndParseSitemap(
  sitemapUrl: string
): Promise<SitemapEntry[]> {
  // Fetch the sitemap XML with a 30s timeout
  let response: Response;
  try {
    response = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(30_000),
      redirect: "follow",
    });
  } catch {
    throw new Error("FETCH_FAILED");
  }

  if (!response.ok) {
    throw new Error("FETCH_FAILED");
  }

  const xmlText = await response.text();

  // Parse the XML
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(xmlText);
  } catch {
    throw new Error("INVALID_SITEMAP");
  }

  // Determine if this is a sitemap index or a standard sitemap
  const root = parsed as {
    urlset?: { url?: Array<{ loc: string; lastmod?: string }> };
    sitemapindex?: { sitemap?: Array<{ loc: string }> };
  };

  // Standard sitemap: <urlset><url>...</url></urlset>
  if (root.urlset?.url) {
    return root.urlset.url.map((entry) => ({
      loc: typeof entry.loc === "string" ? entry.loc.trim() : String(entry.loc),
      lastmod: entry.lastmod ? String(entry.lastmod) : null,
    }));
  }

  // Sitemap index: <sitemapindex><sitemap><loc>...</loc></sitemap></sitemapindex>
  if (root.sitemapindex?.sitemap) {
    const MAX_NESTED_SITEMAPS = 50;
    const MAX_TOTAL_ENTRIES = 50_000;
    const nestedUrls = root.sitemapindex.sitemap.slice(0, MAX_NESTED_SITEMAPS);
    const entries: SitemapEntry[] = [];

    // Fetch nested sitemaps in batches of 5 for concurrency control
    for (let i = 0; i < nestedUrls.length; i += 5) {
      const batch = nestedUrls.slice(i, i + 5);
      const results = await Promise.all(
        batch.map((s) => fetchAndParseSitemap(String(s.loc)))
      );
      for (const result of results) {
        entries.push(...result);
        if (entries.length >= MAX_TOTAL_ENTRIES) break;
      }
      if (entries.length >= MAX_TOTAL_ENTRIES) break;
    }

    return entries.slice(0, MAX_TOTAL_ENTRIES);
  }

  throw new Error("INVALID_SITEMAP");
}

// ---------------------------------------------------------------------------
// Import Orchestration
// ---------------------------------------------------------------------------

/**
 * Import sources from a sitemap URL into a workspace.
 *
 * Steps:
 * 1. Fetch and parse the sitemap (supports sitemap index).
 * 2. Apply optional path rule filters and max pages cap.
 * 3. Extract unique domains, ensure they exist in the DB.
 * 4. Insert new sources (skip existing via dedup check).
 *
 * Idempotent: skips URLs that already have a source row.
 *
 * @param workspaceId - The workspace to import into
 * @param sitemapUrl - The sitemap URL to fetch
 * @param options - Optional path filtering and page limits
 * @returns Import result with counts and filtered URL list
 */
export async function importFromSitemap(
  workspaceId: string,
  sitemapUrl: string,
  options?: ImportOptions
): Promise<ImportResult> {
  const supabase = await createServerClient();

  // Step 1: Fetch and parse the sitemap
  const entries = await fetchAndParseSitemap(sitemapUrl);

  if (entries.length === 0) {
    return { imported: 0, upserted: 0, filteredUrls: [] };
  }

  // Step 1b: Apply path rule filters if provided
  let filtered = entries;
  if (options?.pathRules && options.pathRules.length > 0) {
    const logic = options.pathLogic ?? "AND";
    filtered = entries.filter((entry) => {
      const pathname = new URL(entry.loc).pathname;
      return logic === "AND"
        ? options.pathRules!.every((rule) => evaluatePathRule(pathname, rule))
        : options.pathRules!.some((rule) => evaluatePathRule(pathname, rule));
    });
  }

  // Step 1c: Apply max pages cap (workspace budget)
  if (options?.maxPages !== undefined) {
    const { count } = await supabase
      .from("sources")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    const currentCount = count ?? 0;
    const remaining = Math.max(0, options.maxPages - currentCount);
    filtered = filtered.slice(0, remaining);
  }

  const filteredUrls = filtered.map((e) => e.loc);

  if (filtered.length === 0) {
    return { imported: 0, upserted: 0, filteredUrls };
  }

  // Step 2-3: Extract unique domains, ensure they exist, build hostname→UUID map
  const uniqueDomains = [...new Set(filtered.map((e) => extractDomain(e.loc)))];
  const domainIdPairs = await Promise.all(
    uniqueDomains.map(async (domain) => {
      const id = await ensureDomainExists(workspaceId, domain);
      return [domain, id] as const;
    })
  );
  const domainMap = new Map(domainIdPairs);

  // Step 4: Insert new sources in batches of 1000
  const BATCH_SIZE = 1000;
  const allRecords = filtered.map((entry) => ({
    workspace_id: workspaceId,
    source_url: entry.loc,
    domain_id: domainMap.get(extractDomain(entry.loc))!,
    lastmod: entry.lastmod,
  }));

  // Fetch all existing source_urls in this workspace to check for dupes
  const existingUrls = new Set<string>();
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from("sources")
      .select("source_url")
      .eq("workspace_id", workspaceId)
      .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) existingUrls.add(row.source_url);
    if (data.length < BATCH_SIZE) break;
    page++;
  }

  // Filter out records that already exist
  const newRecords = allRecords.filter((r) => !existingUrls.has(r.source_url));

  let upserted = 0;
  for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
    const batch = newRecords.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("sources").insert(batch);

    if (error) {
      throw new Error(`Failed to insert sources: ${error.message}`);
    }
    upserted += batch.length;
  }

  return {
    imported: filtered.length,
    upserted,
    filteredUrls,
  };
}
