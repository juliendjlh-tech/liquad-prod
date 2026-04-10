// ---------------------------------------------------------------------------
// Domain CRUD service
//
// Handles domain creation, listing with content counts, impact analysis,
// and deletion with catalog filter_rules cleanup.
//
// Extracted from content.service.ts for single-responsibility.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import type { Json } from "@/lib/db/types";
import type { FilterRules } from "@/lib/validations/catalog.schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DomainWithCount {
  id: string;
  domain: string;
  content_count: number;
  created_at: string | null;
}

export interface DomainDeleteImpact {
  content_count: number;
  affected_catalogs: Array<{ id: string; name: string }>;
}

// ---------------------------------------------------------------------------
// Domain Creation
// ---------------------------------------------------------------------------

/**
 * Ensure a domain record exists for the workspace and return its UUID.
 *
 * If the domain doesn't exist, creates it.
 * Uses upsert on UNIQUE(workspace_id, domain) for idempotency.
 *
 * @param workspaceId - The workspace UUID
 * @param domain - The domain hostname (e.g., "example.com")
 * @returns The domain UUID
 */
export async function ensureDomainExists(
  workspaceId: string,
  domain: string
): Promise<string> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("domains")
    .upsert(
      { workspace_id: workspaceId, domain },
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
// Domain Listing
// ---------------------------------------------------------------------------

/**
 * List all domains for a workspace with their source count.
 * Optionally filter by domain name substring.
 *
 * Uses an RPC function (get_domain_content_counts) for efficient
 * GROUP BY aggregation instead of N+1 queries.
 *
 * @param workspaceId - The workspace UUID
 * @param search - Optional domain name filter (case-insensitive partial match)
 * @returns Array of domains with content counts
 */
export async function getDomainsWithContentCount(
  workspaceId: string,
  search?: string
): Promise<DomainWithCount[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from("domains")
    .select("id, domain, created_at")
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
    content_count: countMap.get(d.id) ?? 0,
    created_at: d.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Domain Deletion
// ---------------------------------------------------------------------------

/**
 * Compute the impact of deleting a domain before actually deleting it.
 *
 * Returns source count and catalogs that reference this domain_id
 * in their filter_rules. Used by the UI to show a confirmation dialog.
 *
 * @param domainId - The domain UUID to analyze
 * @param workspaceId - The workspace UUID (for scoping)
 * @returns Impact analysis or null if domain not found
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
 * Steps:
 * 1. Remove the domain_id from filter_rules of all catalogs in the workspace.
 *    If a catalog ends up with zero domain_rules, it is deactivated.
 * 2. Delete the domain (sources + chunks cascade-deleted via FK).
 *
 * @param domainId - The domain UUID to delete
 * @param workspaceId - The workspace UUID (for scoping)
 * @returns true if deleted, false if domain not found
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

  // Clean up catalogs referencing this domain_id in their filter_rules
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
