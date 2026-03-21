import { createServerClient } from "@/lib/db/supabase-server";
import type { Json } from "@/lib/db/types";
import type {
  CreateCatalogInput,
  UpdateCatalogInput,
  FilterRules,
} from "@/lib/validations/catalog.schema";
import { matchContentAgainstRules } from "@/lib/validations/catalog.schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogListItem {
  id: string;
  name: string;
  description: string | null;
  filter_rules: FilterRules;
  price_eur: number;
  status: string;
  agent_count: number;
  content_count: number;
  created_at: string;
}

export interface CatalogDetail {
  id: string;
  name: string;
  description: string | null;
  filter_rules: FilterRules;
  price_eur: number;
  status: string;
  created_at: string;
  agents: Array<{
    id: string;
    name: string;
    ua_pattern: string;
    is_active: boolean;
  }>;
}

export interface PreviewResult {
  matched_count: number;
  total_contents: number;
  per_domain: Array<{
    domain: string;
    domain_id: string;
    matched: number;
    total: number;
  }>;
  matched_contents: Array<{
    id: string;
    source_url: string;
    title: string | null;
    matched: boolean;
  }>;
  warnings: string[];
  page: number;
  limit: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch ALL rows from a table, paginating through Supabase's default 1000-row
 * limit. Returns all rows matching the query.
 */
async function fetchAllContentUrls(
  workspaceId: string,
  columns: string = "source_url"
): Promise<Array<Record<string, unknown>>> {
  const supabase = await createServerClient();
  const PAGE_SIZE = 1000;
  const allRows: Array<Record<string, unknown>> = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("contents")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch contents: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    const rows = data as unknown as Array<Record<string, unknown>>;
    allRows.push(...rows);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Build a map of domain_id -> hostname for a workspace.
 */
async function buildDomainMap(
  workspaceId: string
): Promise<Map<string, string>> {
  const supabase = await createServerClient();
  const { data: domains } = await supabase
    .from("domains")
    .select("id, domain")
    .eq("workspace_id", workspaceId);

  const map = new Map<string, string>();
  for (const d of domains ?? []) {
    map.set(d.id, d.domain);
  }
  return map;
}

/**
 * Count contents matching filter_rules using structured matching.
 */
function countMatchedContents(
  contents: Array<{ source_url: string }>,
  filterRules: FilterRules,
  domainMap: Map<string, string>
): number {
  let count = 0;
  for (const c of contents) {
    try {
      const url = new URL(c.source_url);
      if (matchContentAgainstRules(url.hostname, url.pathname, filterRules, domainMap)) {
        count++;
      }
    } catch {
      // Skip invalid URLs
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new catalog and link authorized agents.
 * New catalogs always start with status "inactive".
 */
export async function createCatalog(
  workspaceId: string,
  data: CreateCatalogInput
): Promise<CatalogDetail> {
  const supabase = await createServerClient();

  // Validate agent_ids belong to the workspace
  if (data.agent_ids.length > 0) {
    const { data: validAgents } = await supabase
      .from("user_agents")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("id", data.agent_ids);

    if ((validAgents?.length ?? 0) !== data.agent_ids.length) {
      throw new Error("INVALID_AGENT_IDS");
    }
  }

  // Validate domain_ids belong to the workspace
  const domainIds = data.filter_rules.domain_rules.map((r) => r.domain_id);
  if (domainIds.length > 0) {
    const { data: validDomains } = await supabase
      .from("domains")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("id", domainIds);

    if ((validDomains?.length ?? 0) !== new Set(domainIds).size) {
      throw new Error("INVALID_DOMAIN_IDS");
    }
  }

  // Insert the catalog
  const { data: catalog, error: catalogError } = await supabase
    .from("catalogs")
    .insert({
      workspace_id: workspaceId,
      name: data.name,
      description: data.description ?? null,
      filter_rules: data.filter_rules as unknown as Json,
      price_eur: data.price_eur,
      status: "inactive",
    })
    .select("id, name, description, filter_rules, price_eur, status, created_at")
    .single();

  if (catalogError || !catalog) {
    throw new Error(`Failed to create catalog: ${catalogError?.message}`);
  }

  // Link agents via catalog_agents junction table
  if (data.agent_ids.length > 0) {
    const junctionRows = data.agent_ids.map((agentId) => ({
      catalog_id: catalog.id,
      user_agent_id: agentId,
    }));

    const { error: linkError } = await supabase
      .from("catalog_agents")
      .insert(junctionRows);

    if (linkError) {
      throw new Error(`Failed to link agents: ${linkError.message}`);
    }
  }

  return getCatalogById(catalog.id, workspaceId) as Promise<CatalogDetail>;
}

/**
 * List all catalogs for a workspace with agent count.
 * Ordered by created_at ASC (first match wins).
 */
export async function getCatalogs(
  workspaceId: string
): Promise<CatalogListItem[]> {
  const supabase = await createServerClient();

  const { data: catalogs, error } = await supabase
    .from("catalogs")
    .select("id, name, description, filter_rules, price_eur, status, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list catalogs: ${error.message}`);
  }

  // Fetch all contents and domain map for matching
  const contents = (await fetchAllContentUrls(
    workspaceId,
    "source_url"
  )) as Array<{ source_url: string }>;
  const domainMap = await buildDomainMap(workspaceId);

  const results: CatalogListItem[] = [];
  for (const catalog of catalogs ?? []) {
    const { count } = await supabase
      .from("catalog_agents")
      .select("user_agent_id", { count: "exact", head: true })
      .eq("catalog_id", catalog.id);

    const filterRules = catalog.filter_rules as unknown as FilterRules;
    const contentCount = countMatchedContents(contents, filterRules, domainMap);

    results.push({
      id: catalog.id,
      name: catalog.name,
      description: catalog.description,
      filter_rules: filterRules,
      price_eur: Number(catalog.price_eur),
      status: catalog.status,
      agent_count: count ?? 0,
      content_count: contentCount,
      created_at: catalog.created_at!,
    });
  }

  return results;
}

/**
 * Get a single catalog with full agent details.
 */
export async function getCatalogById(
  catalogId: string,
  workspaceId: string
): Promise<CatalogDetail | null> {
  const supabase = await createServerClient();

  const { data: catalog, error } = await supabase
    .from("catalogs")
    .select("id, name, description, filter_rules, price_eur, status, created_at")
    .eq("id", catalogId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !catalog) {
    return null;
  }

  // Fetch linked agents
  const { data: links } = await supabase
    .from("catalog_agents")
    .select("user_agent_id")
    .eq("catalog_id", catalogId);

  const agentIds = (links ?? []).map((l) => l.user_agent_id);

  let agents: CatalogDetail["agents"] = [];
  if (agentIds.length > 0) {
    const { data: agentData } = await supabase
      .from("user_agents")
      .select("id, name, ua_pattern, is_active")
      .in("id", agentIds);

    agents = (agentData ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      ua_pattern: a.ua_pattern,
      is_active: a.is_active ?? true,
    }));
  }

  return {
    id: catalog.id,
    name: catalog.name,
    description: catalog.description,
    filter_rules: catalog.filter_rules as unknown as FilterRules,
    price_eur: Number(catalog.price_eur),
    status: catalog.status,
    created_at: catalog.created_at!,
    agents,
  };
}

/**
 * Update a catalog and optionally replace agent links.
 */
export async function updateCatalog(
  catalogId: string,
  workspaceId: string,
  data: UpdateCatalogInput
): Promise<CatalogDetail | null> {
  const supabase = await createServerClient();

  const existing = await getCatalogById(catalogId, workspaceId);
  if (!existing) {
    return null;
  }

  // If agent_ids provided, validate and replace
  if (data.agent_ids !== undefined) {
    if (data.agent_ids.length > 0) {
      const { data: validAgents } = await supabase
        .from("user_agents")
        .select("id")
        .eq("workspace_id", workspaceId)
        .in("id", data.agent_ids);

      if ((validAgents?.length ?? 0) !== data.agent_ids.length) {
        throw new Error("INVALID_AGENT_IDS");
      }
    }

    await supabase
      .from("catalog_agents")
      .delete()
      .eq("catalog_id", catalogId);

    if (data.agent_ids.length > 0) {
      await supabase.from("catalog_agents").insert(
        data.agent_ids.map((agentId) => ({
          catalog_id: catalogId,
          user_agent_id: agentId,
        }))
      );
    }
  }

  // Validate domain_ids if filter_rules provided
  if (data.filter_rules) {
    const domainIds = data.filter_rules.domain_rules.map((r) => r.domain_id);
    if (domainIds.length > 0) {
      const { data: validDomains } = await supabase
        .from("domains")
        .select("id")
        .eq("workspace_id", workspaceId)
        .in("id", domainIds);

      if ((validDomains?.length ?? 0) !== new Set(domainIds).size) {
        throw new Error("INVALID_DOMAIN_IDS");
      }
    }
  }

  // Build update object (only provided fields)
  const updateFields: Record<string, unknown> = {};
  if (data.name !== undefined) updateFields.name = data.name;
  if (data.description !== undefined) updateFields.description = data.description;
  if (data.filter_rules !== undefined) updateFields.filter_rules = data.filter_rules;
  if (data.price_eur !== undefined) updateFields.price_eur = data.price_eur;
  if (data.status !== undefined) updateFields.status = data.status;

  if (Object.keys(updateFields).length > 0) {
    const { error } = await supabase
      .from("catalogs")
      .update(updateFields)
      .eq("id", catalogId)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error(`Failed to update catalog: ${error.message}`);
    }
  }

  return getCatalogById(catalogId, workspaceId) as Promise<CatalogDetail>;
}

/**
 * Delete a catalog (cascade removes catalog_agents).
 */
export async function deleteCatalog(
  catalogId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const existing = await getCatalogById(catalogId, workspaceId);
  if (!existing) {
    return false;
  }

  const { error } = await supabase
    .from("catalogs")
    .delete()
    .eq("id", catalogId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to delete catalog: ${error.message}`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Preview which contents match given filter rules.
 * Uses structured matching (no regex).
 */
export async function previewCatalogMatch(
  workspaceId: string,
  filterRules: FilterRules,
  page = 1,
  limit = 50
): Promise<PreviewResult> {
  // Fetch all contents with domain info
  const contents = (await fetchAllContentUrls(
    workspaceId,
    "id, source_url, title"
  )) as Array<{ id: string; source_url: string; title: string | null }>;
  const totalContents = contents.length;

  // Build domain map
  const domainMap = await buildDomainMap(workspaceId);

  // Match each content and track per-domain stats
  const perDomainStats = new Map<
    string,
    { domain: string; domain_id: string; matched: number; total: number }
  >();
  const matchedContents: Array<{
    id: string;
    source_url: string;
    title: string | null;
    matched: boolean;
  }> = [];

  for (const content of contents) {
    try {
      const url = new URL(content.source_url);
      const hostname = url.hostname;
      const pathname = url.pathname;

      // Find domain_id for this hostname
      let contentDomainId: string | undefined;
      for (const [id, domain] of domainMap) {
        if (domain === hostname) {
          contentDomainId = id;
          break;
        }
      }

      // Update per-domain total
      if (contentDomainId) {
        if (!perDomainStats.has(contentDomainId)) {
          perDomainStats.set(contentDomainId, {
            domain: hostname,
            domain_id: contentDomainId,
            matched: 0,
            total: 0,
          });
        }
        perDomainStats.get(contentDomainId)!.total++;
      }

      const isMatched = matchContentAgainstRules(
        hostname,
        pathname,
        filterRules,
        domainMap
      );

      if (isMatched && contentDomainId) {
        perDomainStats.get(contentDomainId)!.matched++;
      }

      matchedContents.push({
        id: content.id,
        source_url: content.source_url,
        title: content.title,
        matched: isMatched,
      });
    } catch {
      // Skip invalid URLs
    }
  }

  const matched = matchedContents.filter((c) => c.matched);
  const matchedCount = matched.length;

  // Generate warnings
  const warnings: string[] = [];
  if (matchedCount === 0) {
    warnings.push("no_match");
  }
  if (totalContents > 0 && matchedCount / totalContents > 0.8) {
    warnings.push("too_broad");
  }

  // Check for domains with 0 matches
  for (const rule of filterRules.domain_rules) {
    const stats = perDomainStats.get(rule.domain_id);
    if (stats && stats.matched === 0) {
      const hostname = domainMap.get(rule.domain_id) ?? rule.domain_id;
      warnings.push(`domain_no_match:${hostname}`);
    }
  }

  // Paginate matched contents (show matched first)
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  const paginatedContents = matched.slice(offset, offset + safeLimit);

  return {
    matched_count: matchedCount,
    total_contents: totalContents,
    per_domain: [...perDomainStats.values()],
    matched_contents: paginatedContents,
    warnings,
    page: safePage,
    limit: safeLimit,
    total_pages: Math.ceil(matchedCount / safeLimit),
  };
}

// ---------------------------------------------------------------------------
// Domain Verification Helper
// ---------------------------------------------------------------------------

/**
 * Check if a workspace has at least one verified domain.
 */
export async function hasVerifiedDomain(
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const { count } = await supabase
    .from("domains")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "verified");

  return (count ?? 0) > 0;
}
