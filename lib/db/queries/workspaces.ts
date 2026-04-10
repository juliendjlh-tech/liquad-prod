// ---------------------------------------------------------------------------
// Workspace query module
//
// Atomic queries for workspace-level data (secrets, balance, etc.).
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

/**
 * Fetch the HMAC signing secret for a workspace.
 *
 * Used by:
 * - sdk-gateway.service.ts — includes it in the SDK rules payload
 * - sdk-transaction.service.ts — signs tokens after grant creation
 */
export async function getWorkspaceSecret(
  workspaceId: string
): Promise<string> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("workspaces")
    .select("jwt_signing_secret")
    .eq("id", workspaceId)
    .single();

  if (error || !data?.jwt_signing_secret) {
    throw new Error(`Failed to fetch workspace secret: ${error?.message ?? "not found"}`);
  }

  return data.jwt_signing_secret;
}
