import { XMLParser } from "fast-xml-parser";
import { createServerClient } from "@/lib/db/supabase-server";

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
}

export interface ContentRow {
  id: string;
  workspace_id: string;
  source_url: string;
  domain: string;
  title: string | null;
  lastmod: string | null;
  created_at: string;
}

export interface PaginatedContents {
  items: ContentRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface GetContentsParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  search?: string;
  domain?: string;
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
 * Ensure a domain record exists for the workspace.
 * If not existing, creates it with status "unverified".
 * Uses upsert on UNIQUE(workspace_id, domain) for idempotency.
 */
export async function ensureDomainExists(
  workspaceId: string,
  domain: string
): Promise<void> {
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
}

// ---------------------------------------------------------------------------
// Content Import
// ---------------------------------------------------------------------------

/**
 * Import contents from a sitemap URL into a workspace.
 *
 * STEPS:
 * 1. Fetch and parse the sitemap (supports sitemap index).
 * 2. Extract unique domains from all URLs.
 * 3. Create domain records for new domains (status: "unverified").
 * 4. Upsert all entries in batches (insert or update on conflict).
 *
 * Idempotent: uses UPSERT on UNIQUE(workspace_id, source_url) —
 * new URLs are inserted, existing URLs get their lastmod updated.
 */
export async function importFromSitemap(
  workspaceId: string,
  sitemapUrl: string
): Promise<ImportResult> {
  const supabase = await createServerClient();

  // Step 1: Fetch and parse the sitemap
  const entries = await fetchAndParseSitemap(sitemapUrl);

  if (entries.length === 0) {
    return { imported: 0, upserted: 0 };
  }

  // Step 2-3: Extract unique domains and ensure they exist
  const uniqueDomains = [...new Set(entries.map((e) => extractDomain(e.loc)))];
  await Promise.all(
    uniqueDomains.map((domain) => ensureDomainExists(workspaceId, domain))
  );

  // Step 4: Upsert all entries in batches of 1000
  // Uses UNIQUE(workspace_id, source_url) constraint — inserts new records,
  // updates lastmod on existing ones. Eliminates the need to fetch existing
  // URLs, classify entries, or update records one by one.
  const BATCH_SIZE = 1000;
  const allRecords = entries.map((entry) => ({
    workspace_id: workspaceId,
    source_url: entry.loc,
    domain: extractDomain(entry.loc),
    lastmod: entry.lastmod,
  }));

  let upserted = 0;
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("contents")
      .upsert(batch, { onConflict: "workspace_id,source_url" });

    if (error) {
      throw new Error(`Failed to upsert contents: ${error.message}`);
    }
    upserted += batch.length;
  }

  return {
    imported: entries.length,
    upserted,
  };
}

// ---------------------------------------------------------------------------
// Domain Listing
// ---------------------------------------------------------------------------

/**
 * List all domains for a workspace with their content count.
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

  // Get content counts per domain in a single GROUP BY query via RPC
  // (replaces N+1 individual COUNT queries)
  const { data: counts } = await supabase.rpc("get_domain_content_counts", {
    p_workspace_id: workspaceId,
  });
  const countMap = new Map<string, number>();
  for (const row of (counts ?? []) as Array<{ domain: string; content_count: number }>) {
    countMap.set(row.domain, Number(row.content_count));
  }

  return domains.map((d) => ({
    id: d.id,
    domain: d.domain,
    status: d.status,
    content_count: countMap.get(d.domain) ?? 0,
    created_at: d.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Content Listing (Paginated + Search)
// ---------------------------------------------------------------------------

/**
 * List imported contents for a workspace with pagination and optional search.
 *
 * - Paginates using offset-based pagination.
 * - Search filters source_url using ILIKE (case-insensitive partial match).
 * - Orders by created_at DESC (newest first).
 */
export async function getContents(
  params: GetContentsParams
): Promise<PaginatedContents> {
  const supabase = await createServerClient();

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const offset = (page - 1) * limit;

  // Build query for items
  let query = supabase
    .from("contents")
    .select("id, workspace_id, source_url, domain, title, lastmod, created_at", {
      count: "exact",
    })
    .eq("workspace_id", params.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Apply domain filter if provided
  if (params.domain) {
    query = query.eq("domain", params.domain);
  }

  // Apply search filter if provided
  if (params.search) {
    query = query.ilike("source_url", `%${params.search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to list contents: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    items: (data ?? []) as ContentRow[],
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ---------------------------------------------------------------------------
// Content Deletion
// ---------------------------------------------------------------------------

/**
 * Delete a single content record by ID, scoped to workspace.
 *
 * @returns true if deleted, false if not found or not in workspace
 */
export async function deleteContent(
  contentId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  // First check if the content exists and belongs to the workspace
  const { data: content } = await supabase
    .from("contents")
    .select("id")
    .eq("id", contentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!content) {
    return false;
  }

  const { error } = await supabase
    .from("contents")
    .delete()
    .eq("id", contentId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to delete content: ${error.message}`);
  }

  return true;
}
