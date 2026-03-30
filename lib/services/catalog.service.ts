// ---------------------------------------------------------------------------
// Catalog service — CRUD operations
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import type { Json } from "@/lib/db/types";
import type {
  CreateCatalogInput,
  UpdateCatalogInput,
  FilterRules,
} from "@/lib/validations/catalog.schema";
import { matchContentAgainstRules } from "@/lib/validations/catalog.schema";
import { syncCatalogSources } from "@/lib/services/catalog-linking.service";

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
  rag_enabled: boolean;
  rag_source_count: number;
  created_at: string;
}

export interface CatalogDetail {
  id: string;
  name: string;
  description: string | null;
  filter_rules: FilterRules;
  price_eur: number;
  status: string;
  rag_enabled: boolean;
  rag_source_count: number;
  created_at: string;
  agents: Array<{
    id: string;
    name: string;
    ua_pattern: string;
    is_active: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch ALL source rows from a workspace, paginating through Supabase's
 * default 1000-row limit.
 */
async function fetchAllSourceUrls(
  workspaceId: string,
  columns: string = "source_url"
): Promise<Array<Record<string, unknown>>> {
  const supabase = await createServerClient();
  const PAGE_SIZE = 1000;
  const allRows: Array<Record<string, unknown>> = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sources")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch sources: ${error.message}`);
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
 * Count sources matching filter_rules using structured matching.
 */
function countMatchedSources(
  sources: Array<{ source_url: string }>,
  filterRules: FilterRules,
  domainMap: Map<string, string>
): number {
  let count = 0;
  for (const s of sources) {
    try {
      const url = new URL(s.source_url);
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
    .select("id, name, description, filter_rules, price_eur, status, rag_enabled, rag_source_count, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list catalogs: ${error.message}`);
  }

  // Fetch all sources and domain map for matching
  const sources = (await fetchAllSourceUrls(
    workspaceId,
    "source_url"
  )) as Array<{ source_url: string }>;
  const domainMap = await buildDomainMap(workspaceId);

  const results: CatalogListItem[] = [];
  for (const catalog of catalogs ?? []) {
    // Count only ACTIVE bots linked to this catalog
    const { data: linkedAgentIds } = await supabase
      .from("catalog_agents")
      .select("user_agent_id")
      .eq("catalog_id", catalog.id);

    let count = 0;
    if (linkedAgentIds && linkedAgentIds.length > 0) {
      const { count: activeCount } = await supabase
        .from("user_agents")
        .select("id", { count: "exact", head: true })
        .in("id", linkedAgentIds.map((l) => l.user_agent_id))
        .eq("is_active", true);
      count = activeCount ?? 0;
    }

    const filterRules = catalog.filter_rules as unknown as FilterRules;
    const contentCount = countMatchedSources(sources, filterRules, domainMap);

    results.push({
      id: catalog.id,
      name: catalog.name,
      description: catalog.description,
      filter_rules: filterRules,
      price_eur: Number(catalog.price_eur),
      status: catalog.status,
      agent_count: count ?? 0,
      content_count: contentCount,
      rag_enabled: catalog.rag_enabled ?? false,
      rag_source_count: catalog.rag_source_count ?? 0,
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
    .select("id, name, description, filter_rules, price_eur, status, rag_enabled, rag_source_count, created_at")
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
    rag_enabled: catalog.rag_enabled ?? false,
    rag_source_count: catalog.rag_source_count ?? 0,
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
  if (data.rag_enabled !== undefined) updateFields.rag_enabled = data.rag_enabled;

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

  // Handle RAG linking based on rag_enabled changes
  if (data.rag_enabled === false) {
    // Disabling RAG: remove all catalog_sources links and reset source count
    await supabase
      .from("catalog_sources")
      .delete()
      .eq("catalog_id", catalogId);

    await supabase
      .from("catalogs")
      .update({ rag_source_count: 0 })
      .eq("id", catalogId);
  } else if (data.rag_enabled === true || data.filter_rules !== undefined) {
    // Enabling RAG or changing filter_rules: re-link sources.
    // Only run if the catalog is (now) RAG-enabled.
    const currentCatalog = await getCatalogById(catalogId, workspaceId);
    if (currentCatalog?.rag_enabled) {
      await syncCatalogSources(workspaceId, catalogId);
    }
  }

  return getCatalogById(catalogId, workspaceId) as Promise<CatalogDetail>;
}

/**
 * Delete a catalog (cascade removes catalog_agents + catalog_sources).
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
