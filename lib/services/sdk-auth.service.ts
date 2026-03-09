import { createServerClient } from "@/lib/db/supabase-server";
import { verifyApiKey } from "@/lib/services/workspace.service";

/**
 * Extract the API key from an Authorization header.
 * Expected format: "Bearer lq_..."
 *
 * @param authHeader - The Authorization header value
 * @returns The API key string, or null if missing/malformed
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
 * Iterates over all workspaces with an api_key_hash and verifies
 * the provided key against each hash using scrypt (constant-time).
 *
 * MVP note: With 3-5 workspaces, iterating is fine.
 * For scale: add a key_prefix column for O(1) lookup.
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

  // Fetch all workspaces with a key hash
  const { data: workspaces, error } = await supabase
    .from("workspaces")
    .select("id, api_key_hash")
    .not("api_key_hash", "is", null);

  if (error || !workspaces) {
    return { error: "Internal authentication error" };
  }

  // Iterate and verify (MVP: small N)
  for (const ws of workspaces) {
    if (!ws.api_key_hash) continue;

    const isValid = await verifyApiKey(extracted.key, ws.api_key_hash);
    if (isValid) {
      return { workspaceId: ws.id };
    }
  }

  return { error: "Invalid API key" };
}
