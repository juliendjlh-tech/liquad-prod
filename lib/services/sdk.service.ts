import { createServerClient } from "@/lib/db/supabase-server";
import type { SdkEventInput } from "@/lib/validations/sdk-event.schema";
import type { FilterRules } from "@/lib/validations/catalog.schema";
import { sdkEventSchema } from "@/lib/validations/sdk-event.schema";
import { normalizeUrl } from "@/lib/utils/url-normalize";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of events required in the last 24h to verify a domain. */
const DOMAIN_VERIFICATION_THRESHOLD = 10;

/** Number of days without events before a verified domain reverts. */
const DOMAIN_STALE_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The complete rules payload sent to the SDK.
 *
 * The SDK caches this object and uses it to make local decisions about
 * incoming requests (bot matching, catalog matching, IC verification).
 * This shape must stay backward-compatible — new fields are additive.
 */
export interface SdkRules {
  workspace_id: string;
  jwt_signing_secret: string;
  verified_domains: string[];

  /** Active agents (bots) for this workspace, each carrying its linked catalog IDs */
  agents: Array<{
    id: string;
    name: string;
    ua_pattern: string;
    /** DNS hostname globs for Identity Check. Empty = IC skipped for this bot. */
    dns_patterns: string[];
    /** Catalog IDs this agent is linked to */
    catalog_ids: string[];
  }>;

  /** Active catalogs (standalone — no agent references) */
  catalogs: Array<{
    id: string;
    name: string;
    filter_rules: {
      domain_rules: Array<{
        domain: string;
        path_rules?: Array<{
          operator: string;
          value: string;
        }>;
        path_logic?: "AND" | "OR";
      }>;
    };
    price_eur: number;
  }>;

  /**
   * Content paths registered in the workspace.
   * Format: "hostname/pathname" (e.g. "example.com/blog/article-1").
   * Used by the SDK for content existence checks — only registered
   * content is accessible to bots.
   */
  known_content_paths: string[];

  /**
   * Identity Check configuration for this workspace.
   * IC is always active — per-bot `dns_patterns` controls verification.
   */
  identity_check: {
    /** Recommended cache TTL for DNS results (in ms). Default: 3,600,000 (1 hour) */
    cache_ttl_ms: number;
    /** Recommended DNS lookup timeout (in ms). Default: 500 */
    dns_timeout_ms: number;
  };
}

export interface IngestResult {
  accepted: number;
  rejected: number;
}

// ---------------------------------------------------------------------------
// SDK Rules
// ---------------------------------------------------------------------------

/**
 * Optional filters for getWorkspaceRules.
 * All filters are independent — agents and catalogs are filtered separately.
 */
export interface WorkspaceRulesFilters {
  /** Only return these catalog IDs. Empty/undefined = all catalogs. */
  catalog_ids?: string[];
  /** Only return these agent IDs. Empty/undefined = all agents. */
  agent_ids?: string[];
  /** Only return catalogs with price_eur <= this value. Undefined = no price filter (all catalogs). */
  max_price_eur?: number;
}

/**
 * Fetch all rules for a workspace (used by the deployed SDK).
 *
 * Returns only:
 * - Verified domains
 * - Active agents (with their linked catalog_ids)
 * - Active catalogs (ordered by created_at ASC)
 *
 * Accepts optional filters to narrow agents/catalogs returned.
 */
export async function getWorkspaceRules(
  workspaceId: string,
  filters?: WorkspaceRulesFilters
): Promise<SdkRules> {
  const maxPrice = filters?.max_price_eur;
  const supabase = await createServerClient();

  // 0. Workspace settings: jwt_signing_secret
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("jwt_signing_secret")
    .eq("id", workspaceId)
    .single();

  // 1. Verified domains
  const { data: domains } = await supabase
    .from("domains")
    .select("domain")
    .eq("workspace_id", workspaceId)
    .eq("status", "verified");

  // 2. Active agents (including dns_patterns for Identity Check)
  let agentsQuery = supabase
    .from("user_agents")
    .select("id, name, ua_pattern, dns_patterns")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  if (filters?.agent_ids && filters.agent_ids.length > 0) {
    agentsQuery = agentsQuery.in("id", filters.agent_ids);
  }

  const { data: agents } = await agentsQuery;

  // 3. All workspace domains (for resolving domain_ids in filter_rules)
  const { data: allDomains } = await supabase
    .from("domains")
    .select("id, domain")
    .eq("workspace_id", workspaceId);

  const domainIdToHostname = new Map(
    (allDomains ?? []).map((d) => [d.id, d.domain])
  );

  // 4. Active catalogs (ordered by created_at ASC), filtered by price and optional IDs
  let catalogsQuery = supabase
    .from("catalogs")
    .select("id, name, filter_rules, price_eur, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (maxPrice !== undefined) {
    catalogsQuery = catalogsQuery.lte("price_eur", maxPrice);
  }

  if (filters?.catalog_ids && filters.catalog_ids.length > 0) {
    catalogsQuery = catalogsQuery.in("id", filters.catalog_ids);
  }

  const { data: catalogs } = await catalogsQuery;

  // 5. Resolve catalog_ids per agent (single query instead of N+1)
  const agentIds = (agents ?? []).map((a) => a.id);
  const { data: allLinks } = agentIds.length > 0
    ? await supabase
        .from("catalog_agents")
        .select("user_agent_id, catalog_id")
        .in("user_agent_id", agentIds)
    : { data: [] as { user_agent_id: string; catalog_id: string }[] };

  // Build price lookup for sorting catalog_ids per agent
  const catalogPriceMap = new Map(
    (catalogs ?? []).map((c) => [c.id, Number(c.price_eur)])
  );

  const agentToCatalogIds = new Map<string, string[]>();
  for (const link of allLinks ?? []) {
    const existing = agentToCatalogIds.get(link.user_agent_id) ?? [];
    existing.push(link.catalog_id);
    agentToCatalogIds.set(link.user_agent_id, existing);
  }

  // Sort each agent's catalog_ids by price ASC
  for (const [, ids] of agentToCatalogIds) {
    ids.sort((a, b) => (catalogPriceMap.get(a) ?? 0) - (catalogPriceMap.get(b) ?? 0));
  }

  // 6. Resolve domain_ids to hostnames in catalog filter_rules
  const resolvedCatalogs = (catalogs ?? []).map((catalog) => {
    const rawRules = catalog.filter_rules as unknown as {
      domain_rules: Array<{
        domain_id: string;
        path_rules?: Array<{ operator: string; value: string }>;
        path_logic?: "AND" | "OR";
      }>;
    };

    const resolvedFilterRules = {
      domain_rules: (rawRules?.domain_rules ?? [])
        .map((rule) => {
          const hostname = domainIdToHostname.get(rule.domain_id);
          if (!hostname) return null;
          return {
            domain: hostname,
            ...(rule.path_rules && rule.path_rules.length > 0
              ? { path_rules: rule.path_rules }
              : {}),
            ...(rule.path_logic ? { path_logic: rule.path_logic } : {}),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    };

    return {
      id: catalog.id,
      name: catalog.name,
      filter_rules: resolvedFilterRules,
      price_eur: Number(catalog.price_eur),
    };
  });

  // 6. Known content paths (for content existence check in SDK)
  //    Fetch all source_url from contents table, paginating through
  //    Supabase's 1000-row default limit (same pattern as catalog.service.ts).
  const PAGE_SIZE = 1000;
  const allContentUrls: string[] = [];
  let from = 0;

  while (true) {
    const { data: contentBatch, error: contentError } = await supabase
      .from("sources")
      .select("source_url")
      .eq("workspace_id", workspaceId)
      .range(from, from + PAGE_SIZE - 1);

    if (contentError) {
      // Non-fatal: if content fetch fails, SDK falls back to current behavior
      break;
    }
    if (!contentBatch || contentBatch.length === 0) break;
    allContentUrls.push(...contentBatch.map((c) => c.source_url));
    if (contentBatch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const knownContentPaths = allContentUrls
    .map((sourceUrl) => normalizeUrl(sourceUrl))
    .filter((p): p is string => p !== null);

  return {
    workspace_id: workspaceId,
    jwt_signing_secret: workspace?.jwt_signing_secret ?? "",
    verified_domains: (domains ?? []).map((d) => d.domain),
    agents: (agents ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      ua_pattern: a.ua_pattern,
      dns_patterns: (a.dns_patterns as string[]) ?? [],
      catalog_ids: agentToCatalogIds.get(a.id) ?? [],
    })),
    catalogs: resolvedCatalogs,
    known_content_paths: knownContentPaths,
    // Identity Check configuration — DNS verification settings.
    // IC is always active; per-bot dns_patterns controls verification.
    identity_check: {
      cache_ttl_ms: 3_600_000, // 1 hour (server-recommended default)
      dns_timeout_ms: 500,     // 500ms (server-recommended default)
    },
  };
}

// ---------------------------------------------------------------------------
// Event Ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest a batch of SDK events for a workspace.
 *
 * - Validates each event individually (partial acceptance).
 * - Batch inserts valid events.
 * - Updates domain.last_event_at for known domains.
 * - Triggers domain verification check for each unique domain.
 */
export async function ingestEvents(
  workspaceId: string,
  events: SdkEventInput[]
): Promise<IngestResult> {
  const supabase = await createServerClient();

  if (events.length === 0) {
    return { accepted: 0, rejected: 0 };
  }

  // Validate each event individually for partial acceptance
  const validEvents: SdkEventInput[] = [];
  let rejected = 0;

  for (const event of events) {
    const result = sdkEventSchema.safeParse(event);
    if (result.success) {
      validEvents.push(result.data);
    } else {
      rejected++;
    }
  }

  // Batch insert valid events
  if (validEvents.length > 0) {
    const rows = validEvents.map((e) => ({
      workspace_id: workspaceId,
      domain: e.domain,
      request_url: e.request_url,
      user_agent_name: e.user_agent_name ?? null,
      user_agent_raw: e.user_agent_raw ?? null,
      matched_catalog_id: e.matched_catalog_id ?? null,
      decision: e.decision,
      price_applied: e.price_applied ?? null,
      consumer_workspace_id: e.consumer_workspace_id ?? null,
      timestamp: e.timestamp,
      // Identity Check metadata (US-IC-07)
      // These columns are nullable — older SDKs that don't send IC data
      // will simply insert NULL for these fields (backward compatible).
      source_ip: e.source_ip ?? null,
      ic_verified: e.ic_verified ?? null,
      ic_hostname: e.ic_hostname ?? null,
      ic_duration_ms: e.ic_duration_ms ?? null,
    }));

    const { error } = await supabase.from("sdk_events").insert(rows);

    if (error) {
      throw new Error(`Failed to insert events: ${error.message}`);
    }

    // Update last_event_at for each unique domain
    const uniqueDomains = [...new Set(validEvents.map((e) => e.domain))];
    await Promise.all(
      uniqueDomains.map(async (domain) => {
        // Update last_event_at for known domains
        await supabase
          .from("domains")
          .update({ last_event_at: new Date().toISOString() })
          .eq("workspace_id", workspaceId)
          .eq("domain", domain);

        // Check domain verification
        await checkAndUpdateDomainVerification(workspaceId, domain);
      })
    );
  }

  return { accepted: validEvents.length, rejected };
}

// ---------------------------------------------------------------------------
// Domain Verification
// ---------------------------------------------------------------------------

/**
 * Check if a domain should be verified based on recent event count.
 * Called after event ingestion.
 *
 * - If already verified, skip (just updated last_event_at above).
 * - Count events in last 24h. If >= threshold, promote to verified.
 */
export async function checkAndUpdateDomainVerification(
  workspaceId: string,
  domain: string
): Promise<void> {
  const supabase = await createServerClient();

  // Check current domain status
  const { data: domainRecord } = await supabase
    .from("domains")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .eq("domain", domain)
    .single();

  // No domain record (domain came from events, not sitemap import) — skip
  if (!domainRecord) return;

  // Already verified — skip
  if (domainRecord.status === "verified") return;

  // Count events in the last 24 hours
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { count } = await supabase
    .from("sdk_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("domain", domain)
    .gte("timestamp", twentyFourHoursAgo);

  // Promote to verified if threshold met
  if ((count ?? 0) >= DOMAIN_VERIFICATION_THRESHOLD) {
    await supabase
      .from("domains")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
      })
      .eq("id", domainRecord.id);
  }
}

/**
 * Unverify stale domains that haven't received events in 30+ days.
 * Should be called periodically (e.g., daily cron or manual trigger).
 *
 * @returns Number of domains unverified
 */
export async function unverifyStaledomains(): Promise<number> {
  const supabase = await createServerClient();

  const staleDate = new Date(
    Date.now() - DOMAIN_STALE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("domains")
    .update({ status: "unverified", verified_at: null })
    .eq("status", "verified")
    .lt("last_event_at", staleDate)
    .select("id");

  if (error) {
    throw new Error(`Failed to unverify stale domains: ${error.message}`);
  }

  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Dashboard Metrics
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  contentAccessible: { covered: number; total: number; percentage: number };
  contentScraped: { scraped: number; total: number; percentage: number };
  topCatalogs: Array<{ id: string; name: string; eventCount: number }>;
  topContents: Array<{ sourceUrl: string; eventCount: number }>;
  topAgents: Array<{ name: string; eventCount: number }>;

  /**
   * Identity Check metrics (US-IC-07).
   *
   * Shows how many bots were blocked by IC, verified/unverified breakdown,
   * and which agents failed IC most often (potential spoofers).
   * Only meaningful when Identity Check is enabled for the workspace.
   */
  identityCheck: {
    /** Number of events with decision = "denied_identity_check" in the period */
    blockedCount: number;
    /** Number of events where ic_verified = true in the period */
    verifiedCount: number;
    /** Number of events where ic_verified = false in the period */
    unverifiedCount: number;
    /** Top agents by IC failure count — potential spoofing targets */
    topFailedAgents: Array<{ name: string; failCount: number }>;
  };
}

/**
 * Compute dashboard metrics for a workspace within a time period.
 */
export async function getDashboardMetrics(
  workspaceId: string,
  periodDays: number
): Promise<DashboardMetrics> {
  const supabase = await createServerClient();
  const periodStart = new Date(
    Date.now() - periodDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // 1. Total contents
  const { count: totalContents } = await supabase
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // 2. Contents covered by at least one active catalog (structured matching)
  const { data: allContents } = await supabase
    .from("sources")
    .select("source_url")
    .eq("workspace_id", workspaceId);

  const { data: activeCatalogs } = await supabase
    .from("catalogs")
    .select("filter_rules")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  // Build domain map for matching
  const { data: metricDomains } = await supabase
    .from("domains")
    .select("id, domain")
    .eq("workspace_id", workspaceId);

  const metricDomainMap = new Map(
    (metricDomains ?? []).map((d) => [d.id, d.domain])
  );

  let covered = 0;
  if (allContents && activeCatalogs && activeCatalogs.length > 0) {
    const { matchContentAgainstRules } = await import(
      "@/lib/validations/catalog.schema"
    );

    for (const content of allContents) {
      try {
        const url = new URL(content.source_url);
        const isCovered = activeCatalogs.some((c) => {
          const rules = c.filter_rules as unknown as FilterRules;
          return matchContentAgainstRules(
            url.hostname,
            url.pathname,
            rules,
            metricDomainMap
          );
        });
        if (isCovered) covered++;
      } catch {
        // Skip invalid URLs
      }
    }
  }

  const total = totalContents ?? 0;
  const contentAccessible = {
    covered,
    total,
    percentage: total > 0 ? Math.round((covered / total) * 100) : 0,
  };

  // 3. Contents scraped (distinct request_url in events within period)
  const { data: scrapedData } = await supabase
    .from("sdk_events")
    .select("request_url")
    .eq("workspace_id", workspaceId)
    .gte("timestamp", periodStart);

  const uniqueScrapedUrls = new Set(
    (scrapedData ?? []).map((e) => e.request_url)
  );
  const scraped = uniqueScrapedUrls.size;
  const contentScraped = {
    scraped,
    total,
    percentage: total > 0 ? Math.round((scraped / total) * 100) : 0,
  };

  // 4. Top catalogs by event count
  const { data: catalogEvents } = await supabase
    .from("sdk_events")
    .select("matched_catalog_id")
    .eq("workspace_id", workspaceId)
    .gte("timestamp", periodStart)
    .not("matched_catalog_id", "is", null);

  const catalogCounts = new Map<string, number>();
  for (const e of catalogEvents ?? []) {
    if (e.matched_catalog_id) {
      catalogCounts.set(
        e.matched_catalog_id,
        (catalogCounts.get(e.matched_catalog_id) ?? 0) + 1
      );
    }
  }

  const topCatalogIds = [...catalogCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const { data: catalogNames } = await supabase
    .from("catalogs")
    .select("id, name")
    .eq("workspace_id", workspaceId);

  const catalogNameMap = new Map(
    (catalogNames ?? []).map((c) => [c.id, c.name])
  );

  const topCatalogs = topCatalogIds.map(([id, count]) => ({
    id,
    name: catalogNameMap.get(id) ?? "Unknown",
    eventCount: count,
  }));

  // 5. Top contents by event count
  const { data: contentEvents } = await supabase
    .from("sdk_events")
    .select("request_url")
    .eq("workspace_id", workspaceId)
    .gte("timestamp", periodStart);

  const contentCounts = new Map<string, number>();
  for (const e of contentEvents ?? []) {
    contentCounts.set(e.request_url, (contentCounts.get(e.request_url) ?? 0) + 1);
  }

  const topContents = [...contentCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([url, count]) => ({ sourceUrl: url, eventCount: count }));

  // 6. Top agents by event count
  const { data: agentEvents } = await supabase
    .from("sdk_events")
    .select("user_agent_name")
    .eq("workspace_id", workspaceId)
    .gte("timestamp", periodStart)
    .not("user_agent_name", "is", null);

  const agentCounts = new Map<string, number>();
  for (const e of agentEvents ?? []) {
    if (e.user_agent_name) {
      agentCounts.set(
        e.user_agent_name,
        (agentCounts.get(e.user_agent_name) ?? 0) + 1
      );
    }
  }

  const topAgents = [...agentCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, eventCount: count }));

  // -------------------------------------------------------------------------
  // 7. Identity Check metrics (US-IC-07)
  // -------------------------------------------------------------------------

  // 7a. Count events with decision = "denied_identity_check" (blocked by IC)
  const { count: icBlockedCount } = await supabase
    .from("sdk_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("decision", "denied_identity_check")
    .gte("timestamp", periodStart);

  // 7b. Count events where ic_verified = true (bot identity confirmed)
  const { count: icVerifiedCount } = await supabase
    .from("sdk_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("ic_verified", true)
    .gte("timestamp", periodStart);

  // 7c. Count events where ic_verified = false (bot identity NOT confirmed)
  const { count: icUnverifiedCount } = await supabase
    .from("sdk_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("ic_verified", false)
    .gte("timestamp", periodStart);

  // 7d. Top agents by IC failure count (potential spoofers)
  // Fetch all denied_identity_check events with their agent names
  const { data: icFailedEvents } = await supabase
    .from("sdk_events")
    .select("user_agent_name")
    .eq("workspace_id", workspaceId)
    .eq("decision", "denied_identity_check")
    .gte("timestamp", periodStart)
    .not("user_agent_name", "is", null);

  const icFailCounts = new Map<string, number>();
  for (const e of icFailedEvents ?? []) {
    if (e.user_agent_name) {
      icFailCounts.set(
        e.user_agent_name,
        (icFailCounts.get(e.user_agent_name) ?? 0) + 1
      );
    }
  }

  const topFailedAgents = [...icFailCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, failCount: count }));

  return {
    contentAccessible,
    contentScraped,
    topCatalogs,
    topContents,
    topAgents,
    identityCheck: {
      blockedCount: icBlockedCount ?? 0,
      verifiedCount: icVerifiedCount ?? 0,
      unverifiedCount: icUnverifiedCount ?? 0,
      topFailedAgents,
    },
  };
}

/**
 * Get domain verification status for dashboard display.
 */
export async function getDomainVerificationStatus(
  workspaceId: string,
  domain: string
): Promise<{
  eventsLast24h: number;
  threshold: number;
  isVerified: boolean;
}> {
  const supabase = await createServerClient();

  const { data: domainRecord } = await supabase
    .from("domains")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("domain", domain)
    .single();

  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { count } = await supabase
    .from("sdk_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("domain", domain)
    .gte("timestamp", twentyFourHoursAgo);

  return {
    eventsLast24h: count ?? 0,
    threshold: DOMAIN_VERIFICATION_THRESHOLD,
    isVerified: domainRecord?.status === "verified",
  };
}
