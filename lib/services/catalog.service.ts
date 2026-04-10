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
import { getDomainMap } from "@/lib/db/queries/domains";
import { getAllSourceUrls } from "@/lib/db/queries/sources";
import { getWorkspaceAgents, getCatalogAgents } from "@/lib/db/queries/agents";
import { getCatalogs as queryCatalogs } from "@/lib/db/queries/catalogs";

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
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  // Validate agent_ids are linked to the workspace via workspace_agents
  if (data.agent_ids.length > 0) {
    const wsAgents = await getWorkspaceAgents(workspaceId);
    const wsAgentIds = new Set(wsAgents.map((a) => a.id));
    if (!data.agent_ids.every((id) => wsAgentIds.has(id))) {
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
      agent_id: agentId,
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
  const catalogs = await queryCatalogs([], { workspaceId });

  // Fetch all sources and domain map for filter_rules matching
  const sourceUrls = await getAllSourceUrls(workspaceId);
  const sources = sourceUrls.map((url) => ({ source_url: url }));
  const domainMap = await getDomainMap(workspaceId);

  // Batch-fetch agent counts for all catalogs in one query
  const catalogIds = catalogs.map((c) => c.id);
  const allCatalogAgents = await getCatalogAgents(catalogIds);
  const agentCountMap = new Map<string, number>();
  for (const link of allCatalogAgents) {
    agentCountMap.set(link.catalog_id, (agentCountMap.get(link.catalog_id) ?? 0) + 1);
  }

  return catalogs.map((catalog) => {
    const filterRules = catalog.filter_rules as unknown as FilterRules;
    const contentCount = countMatchedSources(sources, filterRules, domainMap);

    return {
      id: catalog.id,
      name: catalog.name,
      description: catalog.description,
      filter_rules: filterRules,
      price_eur: catalog.price_eur,
      status: catalog.status,
      agent_count: agentCountMap.get(catalog.id) ?? 0,
      content_count: contentCount,
      rag_enabled: catalog.rag_enabled ?? false,
      rag_source_count: catalog.rag_source_count ?? 0,
      created_at: catalog.created_at!,
    };
  });
}

/**
 * Get a single catalog with full agent details.
 */
export async function getCatalogById(
  catalogId: string,
  workspaceId: string
): Promise<CatalogDetail | null> {
  const results = await queryCatalogs([catalogId], { workspaceId });
  const catalog = results[0];
  if (!catalog) return null;

  // Fetch linked agents in a single query
  const links = await getCatalogAgents([catalogId]);
  const agents = links.map((l) => ({
    id: l.agent.id,
    name: l.agent.name,
    ua_pattern: l.agent.ua_pattern,
  }));

  return {
    id: catalog.id,
    name: catalog.name,
    description: catalog.description,
    filter_rules: catalog.filter_rules as unknown as FilterRules,
    price_eur: catalog.price_eur,
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
      const wsAgents = await getWorkspaceAgents(workspaceId);
      const wsAgentIds = new Set(wsAgents.map((a) => a.id));
      if (!data.agent_ids.every((id) => wsAgentIds.has(id))) {
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
          agent_id: agentId,
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
