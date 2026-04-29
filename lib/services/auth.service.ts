// ---------------------------------------------------------------------------
// Auth service
//
// ADR-006: scopes split.
//   - authenticateSdkKey      → publisher SDK flow, uses workspaces.api_key_hash
//   - authenticateConsumerKey → consumer flow, uses api_keys (bot-bound)
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
// SDK publisher auth — workspaces.api_key_hash
// ---------------------------------------------------------------------------

/**
 * Authenticate a publisher SDK request.
 * One key per workspace, workspace-scoped (no bot identity).
 * Used by /api/sdk/* routes.
 */
export async function authenticateSdkKey(
  authHeader: string | null
): Promise<{ workspaceId: string } | { error: string }> {
  const extracted = extractApiKey(authHeader);
  if ("error" in extracted) {
    return extracted;
  }

  const supabase = await createServerClient();
  const prefix = extracted.key.slice(0, 11);

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, api_key_hash")
    .eq("api_key_prefix", prefix)
    .single();

  if (!workspace?.api_key_hash) {
    return { error: "Invalid API key" };
  }

  const isValid = await verifyApiKey(extracted.key, workspace.api_key_hash);
  return isValid ? { workspaceId: workspace.id } : { error: "Invalid API key" };
}

// ---------------------------------------------------------------------------
// Consumer auth — api_keys (bot-bound)
// ---------------------------------------------------------------------------

export interface ConsumerKeyAuth {
  /** Workspace that owns the key and is debited. */
  workspaceId: string;
  /** Bot identity the key is bound to (NOT NULL invariant enforced in DB). */
  botId: string;
  apiKeyId: string;
  /** Bot subscription the key authorises spending from (NOT NULL since migration 025). */
  botSubscriptionId: string;
  /**
   * If true, /licenses and /sources only return catalogs owned by `workspaceId`.
   * Sourced from workspace_bots(scope_to_workspace) — settable per (workspace, bot).
   * Default false (cross-workspace reconciliation).
   */
  scopeToWorkspace: boolean;
}

/**
 * Authenticate a consumer request.
 * Used by /api/consumer/v1/* and the RAG pipeline.
 * Each key is bound to a bot; debits hit workspaceId.
 */
export async function authenticateConsumerKey(
  authHeader: string | null
): Promise<ConsumerKeyAuth | { error: string }> {
  const extracted = extractApiKey(authHeader);
  if ("error" in extracted) {
    return extracted;
  }

  const supabase = await createServerClient();
  const prefix = extracted.key.slice(0, 11);

  const { data: row } = await supabase
    .from("api_keys")
    .select("id, workspace_id, bot_id, bot_subscription_id, api_key_hash")
    .eq("api_key_prefix", prefix)
    .is("revoked_at", null)
    .single();

  if (!row?.api_key_hash) {
    return { error: "Invalid API key" };
  }

  const isValid = await verifyApiKey(extracted.key, row.api_key_hash);
  if (!isValid) {
    return { error: "Invalid API key" };
  }

  // Resolve scope_to_workspace from workspace_bots junction.
  // Defaults to false if no row is found (defensive; should always exist
  // since api_keys are created against workspace_bots).
  const { data: wsBot } = await supabase
    .from("workspace_bots")
    .select("scope_to_workspace")
    .eq("workspace_id", row.workspace_id)
    .eq("bot_id", row.bot_id)
    .maybeSingle();

  // Best-effort last_used_at — don't block auth on this.
  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    workspaceId: row.workspace_id,
    botId: row.bot_id,
    apiKeyId: row.id,
    botSubscriptionId: row.bot_subscription_id,
    scopeToWorkspace: wsBot?.scope_to_workspace ?? false,
  };
}
