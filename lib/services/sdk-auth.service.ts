import { createServerClient } from "@/lib/db/supabase-server";
import { verifyApiKey } from "@/lib/services/workspace-apikey.service";

/**
 * Extract the API key from an Authorization header.
 * Expected format: "Bearer lq_..."
 *
 * @param authHeader - The Authorization header value
 * @returns The API key string, or an error object if missing/malformed
 */
export function extractApiKey(
  authHeader: string | null
): { key: string } | { error: string } {
  if (!authHeader) {
    return { error: "Missing API key" };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { error: "Invalid Authorization format. Use: Bearer <api_key>" };
  }

  const key = authHeader.slice(7).trim();
  if (!key || !key.startsWith("lq_")) {
    return { error: "Invalid API key" };
  }

  return { key };
}

/**
 * Authenticate an SDK request by API key.
 *
 * Uses the api_key_prefix column for O(1) lookup instead of iterating
 * over all workspaces. The prefix (first 11 chars: "lq_" + 8 random)
 * is stored in plaintext and acts as a lookup key. The full key is then
 * verified against the scrypt hash using timing-safe comparison.
 *
 * @param authHeader - The full Authorization header value
 * @returns { workspaceId } if valid, or { error } if invalid
 */
export async function authenticateSdkRequest(
  authHeader: string | null
): Promise<{ workspaceId: string } | { error: string }> {
  const extracted = extractApiKey(authHeader);
  if ("error" in extracted) {
    return extracted;
  }

  const supabase = await createServerClient();

  // O(1) lookup by prefix instead of O(N) iteration over all workspaces.
  // The api_key_prefix column stores the first 11 chars of the API key
  // (e.g., "lq_a1b2c3d4") and is populated by createWorkspace/regenerateApiKey.
  const prefix = extracted.key.slice(0, 11);

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, api_key_hash")
    .eq("api_key_prefix", prefix)
    .single();

  if (error || !workspace?.api_key_hash) {
    return { error: "Invalid API key" };
  }

  // Verify the full key against the stored scrypt hash (timing-safe)
  const isValid = await verifyApiKey(extracted.key, workspace.api_key_hash);
  return isValid
    ? { workspaceId: workspace.id }
    : { error: "Invalid API key" };
}
