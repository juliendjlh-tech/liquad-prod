import { createServerClient } from "@/lib/db/supabase-server";
import type {
  CreateCatalogInput,
  UpdateCatalogInput,
} from "@/lib/validations/catalog.schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogListItem {
  id: string;
  name: string;
  description: string | null;
  url_patterns: string[];
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
  url_patterns: string[];
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
  matched_contents: Array<{
    id: string;
    source_url: string;
    title: string | null;
  }>;
  warnings: Array<"no_match" | "too_broad">;
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

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new catalog and link authorized agents.
 *
 * New catalogs always start with status "inactive".
 *
 * @throws Error with "INVALID_AGENT_IDS" if any agent_id doesn't belong to workspace
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

  // Insert the catalog
  const { data: catalog, error: catalogError } = await supabase
    .from("catalogs")
    .insert({
      workspace_id: workspaceId,
      name: data.name,
      description: data.description ?? null,
      url_patterns: data.url_patterns,
      price_eur: data.price_eur,
      status: "inactive",
    })
    .select("id, name, description, url_patterns, price_eur, status, created_at")
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

  // Fetch linked agents for response
  return getCatalogById(catalog.id, workspaceId) as Promise<CatalogDetail>;
}

/**
 * List all catalogs for a workspace with agent count.
 * Ordered by created_at ASC (PRD-R-003: first match wins).
 */
export async function getCatalogs(
  workspaceId: string
): Promise<CatalogListItem[]> {
  const supabase = await createServerClient();

  const { data: catalogs, error } = await supabase
    .from("catalogs")
    .select("id, name, description, url_patterns, price_eur, status, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list catalogs: ${error.message}`);
  }

  // Fetch all contents (paginated to bypass Supabase 1000-row default limit)
  const contents = await fetchAllContentUrls(workspaceId, "source_url") as Array<{ source_url: string }>;

  // Get agent counts for each catalog
  const results: CatalogListItem[] = [];
  for (const catalog of catalogs ?? []) {
    const { count } = await supabase
      .from("catalog_agents")
      .select("user_agent_id", { count: "exact", head: true })
      .eq("catalog_id", catalog.id);

    // Compute content_count by matching url_patterns against content pathnames
    let contentCount = 0;
    if (catalog.url_patterns.length > 0 && contents.length > 0) {
      const regexes = catalog.url_patterns.map((p: string) => new RegExp(p));
      
      // test if matching on the source URL pattern
      contentCount = contents.filter((c) =>
        regexes.some((regex) => regex.test(c.source_url))
      ).length;

      /*
      // test if matching on the pathname pattern
      contentCount = contents.filter((c) => {
        try {
          const pathname = new URL(c.source_url).pathname;
          return regexes.some((regex) => regex.test(pathname));
        } catch {
          return false;
        }
      }).length; */
    }

    results.push({
      id: catalog.id,
      name: catalog.name,
      description: catalog.description,
      url_patterns: catalog.url_patterns,
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
 *
 * @returns Catalog detail with agents, or null if not found/wrong workspace
 */
export async function getCatalogById(
  catalogId: string,
  workspaceId: string
): Promise<CatalogDetail | null> {
  const supabase = await createServerClient();

  const { data: catalog, error } = await supabase
    .from("catalogs")
    .select("id, name, description, url_patterns, price_eur, status, created_at")
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
    url_patterns: catalog.url_patterns,
    price_eur: Number(catalog.price_eur),
    status: catalog.status,
    created_at: catalog.created_at!,
    agents,
  };
}

/**
 * Update a catalog and optionally replace agent links.
 *
 * @throws Error with "INVALID_AGENT_IDS" if any agent_id doesn't belong to workspace
 * @returns Updated catalog or null if not found
 */
export async function updateCatalog(
  catalogId: string,
  workspaceId: string,
  data: UpdateCatalogInput
): Promise<CatalogDetail | null> {
  const supabase = await createServerClient();

  // Check catalog exists and belongs to workspace
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

    // Delete existing links
    await supabase
      .from("catalog_agents")
      .delete()
      .eq("catalog_id", catalogId);

    // Insert new links
    if (data.agent_ids.length > 0) {
      await supabase.from("catalog_agents").insert(
        data.agent_ids.map((agentId) => ({
          catalog_id: catalogId,
          user_agent_id: agentId,
        }))
      );
    }
  }

  // Build update object (only provided fields)
  const updateFields: Record<string, unknown> = {};
  if (data.name !== undefined) updateFields.name = data.name;
  if (data.description !== undefined) updateFields.description = data.description;
  if (data.url_patterns !== undefined) updateFields.url_patterns = data.url_patterns;
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
 *
 * @returns true if deleted, false if not found
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
 * Preview which contents match given URL patterns.
 *
 * Tests each content's source_url against the regex patterns in JS.
 * Generates warnings for edge cases (no_match, too_broad).
 */
export async function previewCatalogMatch(
  workspaceId: string,
  urlPatterns: string[],
  page = 1,
  limit = 50
): Promise<PreviewResult> {
  const supabase = await createServerClient();

  // Fetch all contents (paginated to bypass Supabase 1000-row default limit)
  const contents = await fetchAllContentUrls(workspaceId, "id, source_url, title") as Array<{ id: string; source_url: string; title: string | null }>;
  const totalContents = contents.length;

  // Compile regex patterns
  const regexes = urlPatterns.map((p) => new RegExp(p));

 /*
  // Test each content's pathname against patterns
  const matched = contents.filter((content) => {
    try {
      const pathname = new URL(content.source_url).pathname;
      return regexes.some((regex) => regex.test(pathname));
    } catch {
      return false;
    }
  });
  */

  // Test each content's source URL against patterns
  const matched = contents.filter((content) =>
    regexes.some((regex) => regex.test(content.source_url))
  );

  const matchedCount = matched.length;

  // Generate warnings
  const warnings: Array<"no_match" | "too_broad"> = [];
  if (matchedCount === 0) {
    warnings.push("no_match");
  }
  if (totalContents > 0 && matchedCount / totalContents > 0.8) {
    warnings.push("too_broad");
  }

  // Paginate matched contents
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  const paginatedContents = matched.slice(offset, offset + safeLimit);

  return {
    matched_count: matchedCount,
    total_contents: totalContents,
    matched_contents: paginatedContents.map((c) => ({
      id: c.id,
      source_url: c.source_url,
      title: c.title,
    })),
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
 * Used by the PATCH handler to generate activation warnings.
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
