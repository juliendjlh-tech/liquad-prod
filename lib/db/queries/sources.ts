// ---------------------------------------------------------------------------
// Source query module
//
// Centralizes paginated source fetching used by catalog, linking,
// preview, and content services. Replaces 4+ duplicate pagination loops.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

/**
 * Default page size for Supabase range queries.
 * Supabase returns at most 1000 rows per request by default.
 */
const PAGE_SIZE = 1000;

/**
 * Fetch ALL source URLs for a workspace, paginating through
 * Supabase's default row limit.
 *
 * Returns a lightweight array of source_url strings suitable
 * for catalog filter_rules matching. For heavier queries that
 * need id/domain_id, use {@link getAllSourcesWithDomain}.
 *
 * @param workspaceId - The workspace whose sources to fetch
 * @returns Array of source URL strings
 */
export async function getAllSourceUrls(
  workspaceId: string
): Promise<string[]> {
  const supabase = await createServerClient();
  const urls: string[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sources")
      .select("source_url")
      .eq("workspace_id", workspaceId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch sources: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) urls.push(row.source_url);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return urls;
}

/**
 * Fetch ALL sources for a workspace with id, source_url, and domain_id.
 *
 * Used by catalog-linking and catalog-preview services that need to
 * match sources against filter_rules and track which domain each
 * source belongs to.
 *
 * @param workspaceId - The workspace whose sources to fetch
 * @returns Array of source objects with id, source_url, and domain_id
 */
export async function getAllSourcesWithDomain(
  workspaceId: string
): Promise<Array<{ id: string; source_url: string; domain_id: string }>> {
  const supabase = await createServerClient();
  const sources: Array<{ id: string; source_url: string; domain_id: string }> = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sources")
      .select("id, source_url, domain_id")
      .eq("workspace_id", workspaceId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch sources: ${error.message}`);
    if (!data || data.length === 0) break;

    sources.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return sources;
}

/**
 * Fetch sources with custom columns, paginating through Supabase limits.
 *
 * Generic version for cases where the caller needs specific columns
 * (e.g., "id, source_url, title" for catalog preview).
 *
 * @param workspaceId - The workspace whose sources to fetch
 * @param columns - Supabase select string (e.g., "id, source_url, title")
 * @returns Array of row objects matching the selected columns
 */
export async function getAllSourcesCustom<T extends Record<string, unknown>>(
  workspaceId: string,
  columns: string
): Promise<T[]> {
  const supabase = await createServerClient();
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sources")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch sources: ${error.message}`);
    if (!data || data.length === 0) break;

    allRows.push(...(data as unknown as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}
