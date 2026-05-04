// ---------------------------------------------------------------------------
// Domain query module
//
// Centralizes repeated domain lookups used across catalog, linking,
// preview, SDK rules, and dashboard services. Replaces 5+ duplicate
// implementations of the "buildDomainMap" pattern.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { canonicalizeHostname } from "@/lib/utils/hostname";

/**
 * Build a map of domain_id -> hostname for a workspace.
 *
 * This is the single source of truth for resolving domain UUIDs
 * to hostnames. Used by catalog matching, filter_rules resolution,
 * and dashboard metrics.
 *
 * @param workspaceId - The workspace whose domains to fetch
 * @returns Map where key = domain UUID, value = hostname string
 */
export async function getDomainMap(
  workspaceId: string
): Promise<Map<string, string>> {
  const supabase = await createServerClient();

  const { data: domains } = await supabase
    .from("domains")
    .select("id, domain")
    .eq("workspace_id", workspaceId);

  return new Map((domains ?? []).map((d) => [d.id, d.domain]));
}

/**
 * Fetch hostnames of all domains for a workspace.
 *
 * Used by SDK rules endpoint to tell the SDK which domains
 * belong to this publisher.
 *
 * @param workspaceId - The workspace whose domains to fetch
 * @returns Array of hostname strings
 */
/**
 * Batch resolve hostnames → publisher workspace IDs.
 *
 * Single query instead of N sequential lookups.
 * Returns a map where key = hostname, value = workspace_id.
 */
export async function resolvePublisherDomains(
  hostnames: string[]
): Promise<Map<string, string>> {
  if (hostnames.length === 0) return new Map();

  const supabase = await createServerClient();

  const canonicalToOriginal = new Map<string, string[]>();
  for (const h of hostnames) {
    const canonical = canonicalizeHostname(h);
    const list = canonicalToOriginal.get(canonical) ?? [];
    list.push(h);
    canonicalToOriginal.set(canonical, list);
  }

  const { data } = await supabase
    .from("domains")
    .select("domain, workspace_id")
    .in("domain", [...canonicalToOriginal.keys()])
    .eq("status", "verified");

  const result = new Map<string, string>();
  for (const row of data ?? []) {
    for (const original of canonicalToOriginal.get(row.domain) ?? []) {
      result.set(original, row.workspace_id);
    }
  }
  return result;
}

/**
 * Fetch hostnames of all domains for a workspace.
 *
 * Used by SDK rules endpoint to tell the SDK which domains
 * belong to this publisher.
 *
 * @param workspaceId - The workspace whose domains to fetch
 * @returns Array of hostname strings
 */
export async function getWorkspaceDomains(
  workspaceId: string
): Promise<string[]> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("domains")
    .select("domain")
    .eq("workspace_id", workspaceId);

  return (data ?? []).map((d) => d.domain);
}
