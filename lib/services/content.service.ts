// ---------------------------------------------------------------------------
// Content service
//
// Consolidated from:
//   - domain-crud.service.ts (domain lifecycle)
//   - source-crud.service.ts (source listing & deletion)
//   - sitemap-import.service.ts (sitemap parsing & import)
// ---------------------------------------------------------------------------

import { XMLParser } from "fast-xml-parser";
import { createServerClient } from "@/lib/db/supabase-server";
import type { Json } from "@/lib/db/types";
import type { FilterRules } from "@/lib/validations/catalog.schema";
import { evaluatePathRule, type PathRule } from "@/lib/validations/catalog.schema";
import { canonicalizeHostname } from "@/lib/utils/hostname";
import { generatePublicId } from "@/lib/ids";
import { normalizeUrl } from "@liquad/sdk/url-normalize";

// ---------------------------------------------------------------------------
// Types — Domains
// ---------------------------------------------------------------------------

export interface DomainWithCount {
  id: string;
  public_id: string;
  domain: string;
  content_count: number;
  created_at: string | null;
}

export interface DomainDeleteImpact {
  content_count: number;
  affected_catalogs: Array<{ id: string; name: string }>;
}

// ---------------------------------------------------------------------------
// Types — Indexed Sources
// ---------------------------------------------------------------------------

export interface IndexedSourceRow {
  id: string;
  workspace_id: string;
  source_url: string;
  domain_id: string;
  domain: string;
  title: string | null;
  lastmod: string | null;
  created_at: string | null;
}

export interface PaginatedSources {
  items: IndexedSourceRow[];
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

// ---------------------------------------------------------------------------
// Types — Sitemap Import
// ---------------------------------------------------------------------------

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

export interface ImportResult {
  imported: number;
  upserted: number;
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
// Domain — Creation
// ---------------------------------------------------------------------------

/**
 * Ensure a domain record exists for the workspace and return its UUID.
 * Uses upsert on UNIQUE(workspace_id, domain) for idempotency.
 */
export async function ensureDomainExists(
  workspaceId: string,
  domain: string
): Promise<string> {
  const supabase = await createServerClient();
  const host = canonicalizeHostname(domain);

  // Reject if another workspace already owns this domain as verified.
  const { data: claimed } = await supabase
    .from("domains")
    .select("id")
    .eq("domain", host)
    .eq("status", "verified")
    .neq("workspace_id", workspaceId)
    .maybeSingle();

  if (claimed) {
    throw new Error(`domain_claimed: ${host}`);
  }

  const { error } = await supabase
    .from("domains")
    .upsert(
      { public_id: generatePublicId("dom"), workspace_id: workspaceId, domain: host },
      { onConflict: "workspace_id,domain", ignoreDuplicates: true }
    );

  if (error) {
    console.error(`Failed to ensure domain "${host}":`, error.message);
    throw new Error(`Failed to create domain: ${error.message}`);
  }

  const { data: existing } = await supabase
    .from("domains")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("domain", host)
    .single();

  if (!existing) {
    throw new Error(`Failed to resolve domain id for: ${host}`);
  }

  return existing.id;
}

// ---------------------------------------------------------------------------
// Domain — Listing
// ---------------------------------------------------------------------------

/**
 * List all domains for a workspace with their source count.
 */
export async function getDomainsWithContentCount(
  workspaceId: string,
  search?: string
): Promise<DomainWithCount[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("domains")
    .select("id, public_id, domain, created_at")
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

  const { data: counts } = await supabase.rpc("get_domain_content_counts", {
    p_workspace_id: workspaceId,
  });
  const countMap = new Map<string, number>();
  for (const row of (counts ?? []) as Array<{ domain_id: string; content_count: number }>) {
    countMap.set(row.domain_id, Number(row.content_count));
  }

  return domains.map((d) => ({
    id: d.id,
    public_id: d.public_id,
    domain: d.domain,
    content_count: countMap.get(d.id) ?? 0,
    created_at: d.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Domain — Deletion
// ---------------------------------------------------------------------------

/**
 * Compute the impact of deleting a domain.
 */
export async function getDomainDeleteImpact(
  domainId: string,
  workspaceId: string
): Promise<DomainDeleteImpact | null> {
  const supabase = await createServerClient();

  const { data: domain } = await supabase
    .from("domains")
    .select("id")
    .eq("id", domainId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domain) return null;

  const { count } = await supabase
    .from("indexed_sources")
    .select("id", { count: "exact", head: true })
    .eq("domain_id", domainId);

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
 */
export async function deleteDomain(
  domainId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const { data: domain } = await supabase
    .from("domains")
    .select("id")
    .eq("id", domainId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domain) return false;

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

// ---------------------------------------------------------------------------
// Source — Listing
// ---------------------------------------------------------------------------

/**
 * List sources for a workspace with pagination and optional search.
 */
export async function getSources(
  params: GetSourcesParams
): Promise<PaginatedSources> {
  const supabase = await createServerClient();

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const offset = (page - 1) * limit;

  let domainId: string | undefined = params.domainId;
  if (!domainId && params.domain) {
    const { data: domainRecord } = await supabase
      .from("domains")
      .select("id")
      .eq("workspace_id", params.workspaceId)
      .eq("domain", canonicalizeHostname(params.domain))
      .single();

    if (!domainRecord) {
      return { items: [], total: 0, page, totalPages: 0 };
    }
    domainId = domainRecord.id;
  }

  let query = supabase
    .from("indexed_sources")
    .select("id, workspace_id, source_url, domain_id, title, lastmod, created_at, domains(domain)", {
      count: "exact",
    })
    .eq("workspace_id", params.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (domainId) {
    query = query.eq("domain_id", domainId);
  }

  if (params.search) {
    query = query.ilike("source_url", `%${params.search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to list sources: ${error.message}`);
  }

  const total = count ?? 0;

  const items: IndexedSourceRow[] = (data ?? []).map((row) => ({
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
// Source — Deletion
// ---------------------------------------------------------------------------

/**
 * Delete a single indexed source by ID, scoped to workspace.
 */
export async function deleteSource(
  indexedSourceId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const { data: source } = await supabase
    .from("indexed_sources")
    .select("id")
    .eq("id", indexedSourceId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!source) {
    return false;
  }

  const { error } = await supabase
    .from("indexed_sources")
    .delete()
    .eq("id", indexedSourceId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to delete indexed source: ${error.message}`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Sitemap — Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the domain (hostname) from a full URL string.
 */
export function extractDomain(url: string): string {
  return new URL(url).hostname;
}

// ---------------------------------------------------------------------------
// Sitemap — Parsing
// ---------------------------------------------------------------------------

/**
 * Fetch and parse a sitemap.xml URL.
 * Supports both <urlset> and <sitemapindex> (nested).
 */
export async function fetchAndParseSitemap(
  sitemapUrl: string
): Promise<SitemapEntry[]> {
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

  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(xmlText);
  } catch {
    throw new Error("INVALID_SITEMAP");
  }

  const root = parsed as {
    urlset?: { url?: Array<{ loc: string; lastmod?: string }> };
    sitemapindex?: { sitemap?: Array<{ loc: string }> };
  };

  if (root.urlset?.url) {
    return root.urlset.url.map((entry) => ({
      loc: typeof entry.loc === "string" ? entry.loc.trim() : String(entry.loc),
      lastmod: entry.lastmod ? String(entry.lastmod) : null,
    }));
  }

  if (root.sitemapindex?.sitemap) {
    const MAX_NESTED_SITEMAPS = 50;
    const MAX_TOTAL_ENTRIES = 50_000;
    const nestedUrls = root.sitemapindex.sitemap.slice(0, MAX_NESTED_SITEMAPS);
    const entries: SitemapEntry[] = [];

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
// Sitemap — Import Orchestration
// ---------------------------------------------------------------------------

/**
 * Import sources from a sitemap URL into a workspace.
 */
export async function importFromSitemap(
  workspaceId: string,
  sitemapUrl: string,
  options?: ImportOptions
): Promise<ImportResult> {
  const supabase = await createServerClient();

  const entries = await fetchAndParseSitemap(sitemapUrl);

  if (entries.length === 0) {
    return { imported: 0, upserted: 0, filteredUrls: [] };
  }

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

  if (options?.maxPages !== undefined) {
    const { count } = await supabase
      .from("indexed_sources")
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

  // Normalize URLs once upfront — used for both domain extraction and storage.
  // normalizeUrl() strips query strings, fragments, and trailing slashes, so the
  // value stored matches what authorize() will lookup via findSourcesByUrls.
  // Entries whose URL fails to parse are skipped here (defensive — sitemap parsing
  // upstream should have already filtered most invalid URLs).
  interface NormalizedEntry {
    normalizedUrl: string;
    lastmod: string | null;
  }
  const normalized: NormalizedEntry[] = [];
  for (const entry of filtered) {
    const normalizedUrl = normalizeUrl(entry.loc);
    if (!normalizedUrl) continue;
    normalized.push({ normalizedUrl, lastmod: entry.lastmod });
  }

  if (normalized.length === 0) {
    return { imported: 0, upserted: 0, filteredUrls };
  }

  const uniqueDomains = [...new Set(normalized.map((e) => extractDomain(e.normalizedUrl)))];
  const domainIdPairs = await Promise.all(
    uniqueDomains.map(async (domain) => {
      const id = await ensureDomainExists(workspaceId, domain);
      return [domain, id] as const;
    })
  );
  const domainMap = new Map(domainIdPairs);

  const BATCH_SIZE = 1000;
  const allRecords = normalized.map((entry) => ({
    workspace_id: workspaceId,
    source_url: entry.normalizedUrl,
    domain_id: domainMap.get(extractDomain(entry.normalizedUrl))!,
    lastmod: entry.lastmod,
  }));

  const existingUrls = new Set<string>();
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from("indexed_sources")
      .select("source_url")
      .eq("workspace_id", workspaceId)
      .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) existingUrls.add(row.source_url);
    if (data.length < BATCH_SIZE) break;
    page++;
  }

  const newRecords = allRecords.filter((r) => !existingUrls.has(r.source_url));

  let upserted = 0;
  for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
    const batch = newRecords.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("indexed_sources").insert(batch);

    if (error) {
      throw new Error(`Failed to insert indexed sources: ${error.message}`);
    }
    upserted += batch.length;
  }

  return {
    imported: filtered.length,
    upserted,
    filteredUrls,
  };
}
