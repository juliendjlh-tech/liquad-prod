// ---------------------------------------------------------------------------
// Auth service
//
// Cross-cutting API key authentication used by both SDK (publisher)
// and Consumer (crawler operator) routes.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { verifyApiKey } from "@/lib/services/workspace.service";

// ---------------------------------------------------------------------------
// API Key Extraction
// ---------------------------------------------------------------------------

/**
 * Extract the API key from an Authorization header.
 * Expected format: "Bearer lq_..."
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

// ---------------------------------------------------------------------------
// Request Authentication
// ---------------------------------------------------------------------------

/**
 * Authenticate a request by API key.
 * Uses the api_key_prefix column for O(1) lookup, then verifies
 * the full key against the stored scrypt hash (timing-safe).
 *
 * Used by both publisher SDK routes and consumer API routes.
 */
export async function authenticateApiKey(
  authHeader: string | null
): Promise<{ workspaceId: string } | { error: string }> {
  const extracted = extractApiKey(authHeader);
  if ("error" in extracted) {
    return extracted;
  }

  const supabase = await createServerClient();

  const prefix = extracted.key.slice(0, 11);

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, api_key_hash")
    .eq("api_key_prefix", prefix)
    .single();

  if (error || !workspace?.api_key_hash) {
    return { error: "Invalid API key" };
  }

  const isValid = await verifyApiKey(extracted.key, workspace.api_key_hash);
  return isValid
    ? { workspaceId: workspace.id }
    : { error: "Invalid API key" };
}
