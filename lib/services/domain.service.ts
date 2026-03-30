// ---------------------------------------------------------------------------
// Domain service
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

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
