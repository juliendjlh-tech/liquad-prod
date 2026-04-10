// ---------------------------------------------------------------------------
// Dashboard Metrics service
//
// Computes workspace analytics for the publisher dashboard including
// content coverage, top catalogs/agents/contents, and Identity Check stats.
//
// Extracted from sdk.service.ts for single-responsibility.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import type { FilterRules } from "@/lib/validations/catalog.schema";
import { getDomainMap } from "@/lib/db/queries/domains";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  contentAccessible: { covered: number; total: number; percentage: number };
  contentScraped: { scraped: number; total: number; percentage: number };
  topCatalogs: Array<{ id: string; name: string; eventCount: number }>;
  topContents: Array<{ sourceUrl: string; eventCount: number }>;
  topAgents: Array<{ name: string; eventCount: number }>;

  /**
   * Identity Check metrics.
   * Shows how many bots were blocked by IC, verified/unverified breakdown,
   * and which agents failed IC most often (potential spoofers).
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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Compute dashboard metrics for a workspace within a time period.
 *
 * Aggregates data from sources, catalogs, and sdk_events tables to
 * provide a comprehensive view of content licensing activity.
 *
 * @param workspaceId - The workspace UUID
 * @param periodDays - Number of days to look back for event data
 * @returns Complete dashboard metrics object
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

  // Build domain map for matching (shared query module)
  const metricDomainMap = await getDomainMap(workspaceId);

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
  // 7. Identity Check metrics
  // -------------------------------------------------------------------------

  // 7a. Count events blocked by IC
  const { count: icBlockedCount } = await supabase
    .from("sdk_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("decision", "denied_identity_check")
    .gte("timestamp", periodStart);

  // 7b. Count events where bot identity was confirmed
  const { count: icVerifiedCount } = await supabase
    .from("sdk_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("ic_verified", true)
    .gte("timestamp", periodStart);

  // 7c. Count events where bot identity was NOT confirmed
  const { count: icUnverifiedCount } = await supabase
    .from("sdk_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("ic_verified", false)
    .gte("timestamp", periodStart);

  // 7d. Top agents by IC failure count (potential spoofers)
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
