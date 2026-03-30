import { XMLParser } from "fast-xml-parser";
import { createServerClient } from "@/lib/db/supabase-server";
import type { Json } from "@/lib/db/types";
import { evaluatePathRule, type PathRule, type FilterRules } from "@/lib/validations/catalog.schema";

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

export interface SourceRow {
  id: string;
  workspace_id: string;
  source_url: string;
  domain_id: string;
  domain: string; // from joined domains(domain)
  title: string | null;
  lastmod: string | null;
  created_at: string | null;
}

export interface PaginatedSources {
  items: SourceRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface GetSourcesParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  domain?: string;
  domainId?: string;
}

export interface DomainWithCount {
  id: string;
  domain: string;
  status: string;
  content_count: number;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Sitemap Parsing
// ---------------------------------------------------------------------------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === "url" || name === "sitemap",
});

/**
 * Extract the domain (hostname) from a full URL string.
 */
export function extractDomain(url: string): string {
  return new URL(url).hostname;
}

/**
 * Fetch and parse a sitemap.xml URL.
 * Supports both standard <urlset> sitemaps and <sitemapindex> (nested).
 * For sitemap index: recursively fetches each nested sitemap (max 500,
 * 5 in parallel).
 *
 * @throws Error with message "FETCH_FAILED" if HTTP fetch fails
 * @throws Error with message "INVALID_SITEMAP" if XML parsing fails
 */
export async function fetchAndParseSitemap(
  sitemapUrl: string
): Promise<SitemapEntry[]> {
  // Fetch the sitemap XML
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
// Domain Management
// ---------------------------------------------------------------------------

/**
 * Ensure a domain record exists for the workspace and return its UUID.
 * If not existing, creates it with status "unverified".
 * Uses upsert on UNIQUE(workspace_id, domain) for idempotency.
 */
export async function ensureDomainExists(
  workspaceId: string,
  domain: string
): Promise<string> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("domains")
    .upsert(
      { workspace_id: workspaceId, domain, status: "unverified" },
      { onConflict: "workspace_id,domain", ignoreDuplicates: true }
    );

  if (error) {
    console.error(`Failed to ensure domain "${domain}":`, error.message);
    throw new Error(`Failed to create domain: ${error.message}`);
  }

  // ignoreDuplicates doesn't return data, so always fetch the id
  const { data: existing } = await supabase
    .from("domains")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("domain", domain)
    .single();

  if (!existing) {
    throw new Error(`Failed to resolve domain id for: ${domain}`);
  }

  return existing.id;
}

// ---------------------------------------------------------------------------
// Source Import (from sitemap)
// ---------------------------------------------------------------------------

/**
 * Import sources from a sitemap URL into a workspace.
 *
 * STEPS:
 * 1. Fetch and parse the sitemap (supports sitemap index).
 * 2. Extract unique domains from all URLs.
 * 3. Create domain records for new domains (status: "unverified").
 * 4. Insert new sources (skip existing via UNIQUE constraint check).
 *
 * Idempotent: skips URLs that already have a source row.
 */
export interface ImportOptions {
  pathRules?: PathRule[];
  pathLogic?: "AND" | "OR";
  maxPages?: number;
}

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

  // Step 2-3: Extract unique domains, ensure they exist, and build hostname→UUID map
  const uniqueDomains = [...new Set(filtered.map((e) => extractDomain(e.loc)))];
  const domainIdPairs = await Promise.all(
    uniqueDomains.map(async (domain) => {
      const id = await ensureDomainExists(workspaceId, domain);
      return [domain, id] as const;
    })
  );
  const domainMap = new Map(domainIdPairs);

  // Step 4: Insert new sources in batches of 1000.
  // Uses check against existing source_urls to skip duplicates.
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
    const { error } = await supabase
      .from("sources")
      .insert(batch);

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

// ---------------------------------------------------------------------------
// Domain Listing
// ---------------------------------------------------------------------------

/**
 * List all domains for a workspace with their source count.
 * Optionally filter by domain name substring.
 */
export async function getDomainsWithContentCount(
  workspaceId: string,
  search?: string
): Promise<DomainWithCount[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("domains")
    .select("id, domain, status, created_at")
    .eq("workspace_id", workspaceId)
    .order("domain", { ascending: true });

  if (search) {
    query = query.ilike("domain", `%${search}%`);
  }

  const { data: domains, error } = await query;

  if (error) {
    throw new Error(`Failed to list domains: ${error.message}`);
  }

  if (!domains || domains.length === 0) return [];

  // Get source counts per domain_id in a single GROUP BY query via RPC
  const { data: counts } = await supabase.rpc("get_domain_content_counts", {
    p_workspace_id: workspaceId,
  });
  const countMap = new Map<string, number>();
  for (const row of (counts ?? []) as Array<{ domain_id: string; content_count: number }>) {
    countMap.set(row.domain_id, Number(row.content_count));
  }

  return domains.map((d) => ({
    id: d.id,
    domain: d.domain,
    status: d.status,
    content_count: countMap.get(d.id) ?? 0,
    created_at: d.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Source Listing (Paginated + Search)
// ---------------------------------------------------------------------------

/**
 * List sources for a workspace with pagination and optional search.
 *
 * - Paginates using offset-based pagination.
 * - Search filters source_url using ILIKE (case-insensitive partial match).
 * - Orders by created_at DESC (newest first).
 */
export async function getSources(
  params: GetSourcesParams
): Promise<PaginatedSources> {
  const supabase = await createServerClient();

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const offset = (page - 1) * limit;

  // Resolve domain filter — accept either domain_id directly or hostname
  let domainId: string | undefined = params.domainId;
  if (!domainId && params.domain) {
    const { data: domainRecord } = await supabase
      .from("domains")
      .select("id")
      .eq("workspace_id", params.workspaceId)
      .eq("domain", params.domain)
      .single();

    if (!domainRecord) {
      return { items: [], total: 0, page, totalPages: 0 };
    }
    domainId = domainRecord.id;
  }

  // Build query with joined domain name.
  let query = supabase
    .from("sources")
    .select("id, workspace_id, source_url, domain_id, title, lastmod, created_at, domains(domain)", {
      count: "exact",
    })
    .eq("workspace_id", params.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Apply domain_id filter
  if (domainId) {
    query = query.eq("domain_id", domainId);
  }

  // Apply search filter if provided
  if (params.search) {
    query = query.ilike("source_url", `%${params.search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to list sources: ${error.message}`);
  }

  const total = count ?? 0;

  // Flatten the joined domain name into SourceRow shape
  const items: SourceRow[] = (data ?? []).map((row) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    source_url: row.source_url,
    domain_id: row.domain_id,
    domain: (row.domains as unknown as { domain: string } | null)?.domain ?? "",
    title: row.title,
    lastmod: row.lastmod,
    created_at: row.created_at,
  }));

  return {
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ---------------------------------------------------------------------------
// Source Deletion
// ---------------------------------------------------------------------------

/**
 * Delete a single source by ID, scoped to workspace.
 * Chunks are cascade-deleted via FK.
 *
 * @returns true if deleted, false if not found or not in workspace
 */
export async function deleteSource(
  sourceId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const { data: source } = await supabase
    .from("sources")
    .select("id")
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!source) {
    return false;
  }

  const { error } = await supabase
    .from("sources")
    .delete()
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to delete source: ${error.message}`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Domain Deletion (with catalog cleanup)
// ---------------------------------------------------------------------------

export interface DomainDeleteImpact {
  content_count: number;
  affected_catalogs: Array<{ id: string; name: string }>;
}

/**
 * Compute the impact of deleting a domain before actually deleting it.
 * Returns source count and catalogs that reference this domain_id in their filter_rules.
 */
export async function getDomainDeleteImpact(
  domainId: string,
  workspaceId: string
): Promise<DomainDeleteImpact | null> {
  const supabase = await createServerClient();

  // Verify domain exists and belongs to workspace
  const { data: domain } = await supabase
    .from("domains")
    .select("id")
    .eq("id", domainId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domain) return null;

  // Count sources that will be cascade-deleted
  const { count } = await supabase
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("domain_id", domainId);

  // Find catalogs whose filter_rules reference this domain_id
  const { data: catalogs } = await supabase
    .from("catalogs")
    .select("id, name, filter_rules")
    .eq("workspace_id", workspaceId);

  const affected: Array<{ id: string; name: string }> = [];
  for (const catalog of catalogs ?? []) {
    const rules = catalog.filter_rules as unknown as FilterRules | null;
    if (rules?.domain_rules?.some((r) => r.domain_id === domainId)) {
      affected.push({ id: catalog.id, name: catalog.name });
    }
  }

  return {
    content_count: count ?? 0,
    affected_catalogs: affected,
  };
}

/**
 * Delete a domain and clean up catalog filter_rules that reference it.
 *
 * 1. Remove the domain_id from filter_rules of all catalogs in the workspace.
 *    If a catalog ends up with zero domain_rules, it is deactivated.
 * 2. Delete the domain (sources + chunks cascade-deleted via FK).
 */
export async function deleteDomain(
  domainId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  // Verify domain exists and belongs to workspace
  const { data: domain } = await supabase
    .from("domains")
    .select("id")
    .eq("id", domainId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domain) return false;

  // Clean up catalogs referencing this domain_id
  const { data: catalogs } = await supabase
    .from("catalogs")
    .select("id, filter_rules, status")
    .eq("workspace_id", workspaceId);

  for (const catalog of catalogs ?? []) {
    const rules = catalog.filter_rules as unknown as FilterRules | null;
    if (!rules?.domain_rules?.some((r) => r.domain_id === domainId)) continue;

    const cleanedRules = rules.domain_rules.filter(
      (r) => r.domain_id !== domainId
    );

    if (cleanedRules.length === 0) {
      // No domain rules left — deactivate catalog
      await supabase
        .from("catalogs")
        .update({
          filter_rules: { domain_rules: [] } as unknown as Json,
          status: "inactive",
        })
        .eq("id", catalog.id);
    } else {
      await supabase
        .from("catalogs")
        .update({
          filter_rules: { domain_rules: cleanedRules } as unknown as Json,
        })
        .eq("id", catalog.id);
    }
  }

  // Delete domain (sources + chunks cascade via FK)
  const { error } = await supabase
    .from("domains")
    .delete()
    .eq("id", domainId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to delete domain: ${error.message}`);
  }

  return true;
}
