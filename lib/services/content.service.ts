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
  created: number;
  updated: number;
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
    const nestedUrls = root.sitemapindex.sitemap.slice(0, 500);
    const entries: SitemapEntry[] = [];

    // Fetch nested sitemaps in batches of 5 for concurrency control
    for (let i = 0; i < nestedUrls.length; i += 5) {
      const batch = nestedUrls.slice(i, i + 5);
      const results = await Promise.all(
        batch.map((s) => fetchAndParseSitemap(String(s.loc)))
      );
      for (const result of results) {
        entries.push(...result);
      }
    }

    return entries;
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

  await supabase
    .from("domains")
    .upsert(
      { workspace_id: workspaceId, domain, status: "unverified" },
      { onConflict: "workspace_id,domain", ignoreDuplicates: true }
    );
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
 * 4. Fetch existing content source_urls for this workspace.
 * 5. Classify entries as "create" or "update".
 * 6. Batch insert new records, batch update existing records.
 * 7. Return counts.
 *
 * Idempotent: re-importing updates lastmod on existing records.
 */
export async function importFromSitemap(
  workspaceId: string,
  sitemapUrl: string
): Promise<ImportResult> {
  const supabase = await createServerClient();

  // Step 1: Fetch and parse the sitemap
  const entries = await fetchAndParseSitemap(sitemapUrl);

  if (entries.length === 0) {
    return { imported: 0, created: 0, updated: 0 };
  }

  // Step 2-3: Extract unique domains and ensure they exist
  const uniqueDomains = [...new Set(entries.map((e) => extractDomain(e.loc)))];
  await Promise.all(
    uniqueDomains.map((domain) => ensureDomainExists(workspaceId, domain))
  );

  // Step 4: Get existing content source_urls for this workspace
  const { data: existingContents } = await supabase
    .from("contents")
    .select("source_url")
    .eq("workspace_id", workspaceId);

  const existingUrls = new Set(
    (existingContents ?? []).map((c) => c.source_url)
  );

  // Step 5: Classify entries
  const toCreate: Array<{
    workspace_id: string;
    source_url: string;
    domain: string;
    lastmod: string | null;
  }> = [];

  const toUpdate: Array<{
    source_url: string;
    lastmod: string | null;
  }> = [];

  for (const entry of entries) {
    const domain = extractDomain(entry.loc);
    if (existingUrls.has(entry.loc)) {
      toUpdate.push({ source_url: entry.loc, lastmod: entry.lastmod });
    } else {
      toCreate.push({
        workspace_id: workspaceId,
        source_url: entry.loc,
        domain,
        lastmod: entry.lastmod,
      });
    }
  }

  // Step 6a: Batch insert new records
  if (toCreate.length > 0) {
    const { error: insertError } = await supabase
      .from("contents")
      .insert(toCreate);

    if (insertError) {
      throw new Error(`Failed to insert contents: ${insertError.message}`);
    }
  }

  // Step 6b: Update existing records one by one (lastmod)
  for (const record of toUpdate) {
    await supabase
      .from("contents")
      .update({ lastmod: record.lastmod })
      .eq("workspace_id", workspaceId)
      .eq("source_url", record.source_url);
  }

  return {
    imported: entries.length,
    created: toCreate.length,
    updated: toUpdate.length,
  };
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
