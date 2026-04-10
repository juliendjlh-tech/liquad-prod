// ---------------------------------------------------------------------------
// Source CRUD service
//
// Handles paginated source listing and individual source deletion.
// Extracted from content.service.ts for single-responsibility.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceRow {
  id: string;
  workspace_id: string;
  source_url: string;
  domain_id: string;
  domain: string; // from joined domains(domain)
  title: string | null;
  lastmod: string | null;
  created_at: string | null;
}

export interface PaginatedSources {
  items: SourceRow[];
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
// Listing
// ---------------------------------------------------------------------------

/**
 * List sources for a workspace with pagination and optional search.
 *
 * - Paginates using offset-based pagination.
 * - Search filters source_url using ILIKE (case-insensitive partial match).
 * - Supports filtering by domain_id or hostname.
 * - Orders by created_at DESC (newest first).
 *
 * @param params - Query parameters (workspaceId, page, limit, search, domain)
 * @returns Paginated source results
 */
export async function getSources(
  params: GetSourcesParams
): Promise<PaginatedSources> {
  const supabase = await createServerClient();

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const offset = (page - 1) * limit;

  // Resolve domain filter — accept either domain_id directly or hostname
  let domainId: string | undefined = params.domainId;
  if (!domainId && params.domain) {
    const { data: domainRecord } = await supabase
      .from("domains")
      .select("id")
      .eq("workspace_id", params.workspaceId)
      .eq("domain", params.domain)
      .single();

    if (!domainRecord) {
      return { items: [], total: 0, page, totalPages: 0 };
    }
    domainId = domainRecord.id;
  }

  // Build query with joined domain name
  let query = supabase
    .from("sources")
    .select("id, workspace_id, source_url, domain_id, title, lastmod, created_at, domains(domain)", {
      count: "exact",
    })
    .eq("workspace_id", params.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Apply domain_id filter
  if (domainId) {
    query = query.eq("domain_id", domainId);
  }

  // Apply search filter if provided
  if (params.search) {
    query = query.ilike("source_url", `%${params.search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to list sources: ${error.message}`);
  }

  const total = count ?? 0;

  // Flatten the joined domain name into SourceRow shape
  const items: SourceRow[] = (data ?? []).map((row) => ({
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
// Deletion
// ---------------------------------------------------------------------------

/**
 * Delete a single source by ID, scoped to workspace.
 * Chunks are cascade-deleted via FK.
 *
 * @param sourceId - The source UUID to delete
 * @param workspaceId - The workspace UUID (for scoping)
 * @returns true if deleted, false if not found or not in workspace
 */
export async function deleteSource(
  sourceId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const { data: source } = await supabase
    .from("sources")
    .select("id")
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!source) {
    return false;
  }

  const { error } = await supabase
    .from("sources")
    .delete()
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to delete source: ${error.message}`);
  }

  return true;
}
