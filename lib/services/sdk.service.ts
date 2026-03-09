import { createServerClient } from "@/lib/db/supabase-server";
import type { SdkEventInput } from "@/lib/validations/sdk-event.schema";
import { sdkEventSchema } from "@/lib/validations/sdk-event.schema";

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

export interface SdkRules {
  workspace_id: string;
  jwt_signing_secret: string;
  verified_domains: string[];
  user_agents: Array<{
    id: string;
    name: string;
    ua_pattern: string;
  }>;
  catalogs: Array<{
    id: string;
    name: string;
    url_patterns: string[];
    price_eur: number;
    agent_ids: string[];
  }>;
}

export interface IngestResult {
  accepted: number;
  rejected: number;
}

// ---------------------------------------------------------------------------
// SDK Rules
// ---------------------------------------------------------------------------

/**
 * Fetch all rules for a workspace (used by the deployed SDK).
 *
 * Returns only:
 * - Verified domains
 * - Active user-agents
 * - Active catalogs (ordered by created_at ASC — first match wins)
 * - Each catalog's linked agent_ids
 */
export async function getWorkspaceRules(
  workspaceId: string
): Promise<SdkRules> {
  const supabase = await createServerClient();

  // 0. Workspace jwt_signing_secret
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

  // 2. Active user-agents
  const { data: agents } = await supabase
    .from("user_agents")
    .select("id, name, ua_pattern")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  // 3. Active catalogs (ordered by created_at ASC)
  const { data: catalogs } = await supabase
    .from("catalogs")
    .select("id, name, url_patterns, price_eur, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  // 4. Get agent_ids for each catalog
  const catalogsWithAgents = await Promise.all(
    (catalogs ?? []).map(async (catalog) => {
      const { data: links } = await supabase
        .from("catalog_agents")
        .select("user_agent_id")
        .eq("catalog_id", catalog.id);

      return {
        id: catalog.id,
        name: catalog.name,
        url_patterns: catalog.url_patterns,
        price_eur: Number(catalog.price_eur),
        agent_ids: (links ?? []).map((l) => l.user_agent_id),
      };
    })
  );

  return {
    workspace_id: workspaceId,
    jwt_signing_secret: workspace?.jwt_signing_secret ?? "",
    verified_domains: (domains ?? []).map((d) => d.domain),
    user_agents: (agents ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      ua_pattern: a.ua_pattern,
    })),
    catalogs: catalogsWithAgents,
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
    .from("contents")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // 2. Contents covered by at least one active catalog (regex matching in JS)
  const { data: allContents } = await supabase
    .from("contents")
    .select("source_url")
    .eq("workspace_id", workspaceId);

  const { data: activeCatalogs } = await supabase
    .from("catalogs")
    .select("url_patterns")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  let covered = 0;
  if (allContents && activeCatalogs && activeCatalogs.length > 0) {
    const patterns = activeCatalogs.flatMap((c) =>
      (c.url_patterns as string[]).map((p) => {
        try {
          return new RegExp(p);
        } catch {
          return null;
        }
      })
    ).filter((r): r is RegExp => r !== null);

    for (const content of allContents) {
      try {
        const path = new URL(content.source_url).pathname;
        if (patterns.some((re) => re.test(path))) {
          covered++;
        }
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

  return {
    contentAccessible,
    contentScraped,
    topCatalogs,
    topContents,
    topAgents,
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
