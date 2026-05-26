// ---------------------------------------------------------------------------
// Auth service
//
// ADR-006: scopes split.
//   - authenticateSdkKey      → publisher SDK flow, uses gateways.api_key_hash
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
// SDK publisher auth — gateways.api_key_hash (since migration 038)
// ---------------------------------------------------------------------------

export interface SdkKeyAuth {
  /** Workspace owning the gateway. Used for HMAC secret, bots, domains. */
  workspaceId: string;
  /** Gateway id. Surfaced in event logs and rule responses. */
  gatewayId: string;
  /**
   * Catalog allowlist stored on the gateway (internal UUIDs). Empty array
   * means "no catalogs exposed" — the SDK receives an empty rules payload.
   */
  catalogIds: string[];
}

/**
 * Authenticate a publisher SDK request.
 * One key per gateway. A workspace can have N gateways, each with its own
 * catalog allowlist.
 * Used by /api/public/v1/sdk/* routes.
 */
export async function authenticateSdkKey(
  authHeader: string | null
): Promise<SdkKeyAuth | { error: string }> {
  const extracted = extractApiKey(authHeader);
  if ("error" in extracted) {
    return extracted;
  }

  const supabase = await createServerClient();
  const prefix = extracted.key.slice(0, 11);

  const { data: gateway } = await supabase
    .from("gateways")
    .select("id, workspace_id, api_key_hash, catalog_ids")
    .eq("api_key_prefix", prefix)
    .single();

  if (!gateway?.api_key_hash) {
    return { error: "Invalid API key" };
  }

  const isValid = await verifyApiKey(extracted.key, gateway.api_key_hash);
  if (!isValid) return { error: "Invalid API key" };

  return {
    workspaceId: gateway.workspace_id,
    gatewayId: gateway.id,
    catalogIds: gateway.catalog_ids ?? [],
  };
}

// ---------------------------------------------------------------------------
// Consumer auth — api_keys (bot-bound)
// ---------------------------------------------------------------------------

export interface ConsumerKeyAuth {
  /** Workspace that owns the key and is debited. */
  workspaceId: string;
  apiKeyId: string;
  /** Subscription the key authorises spending from. */
  subscriptionId: string;
  /**
   * Network referenced by this key. The accepted catalogues of this network
   * define the access scope at /licenses time.
   */
  networkId: string;
  /**
   * Bot identity claimed by this key. Resolved against the global `bots` table
   * (UA + IPs). Validated at key creation against the network's derived bot
   * set (catalog_bots ∩ network_catalogs accepted).
   */
  botId: string;
}

/**
 * Authenticate a consumer request.
 * Used by /api/public/v1/consumer/* and the RAG pipeline.
 * Keys carry an immutable triple (subscription, network, bot) — body no longer
 * needs to provide bot_id.
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
    .select(
      "id, workspace_id, subscription_id, network_id, bot_id, api_key_hash"
    )
    .eq("api_key_prefix", prefix)
    .is("revoked_at", null)
    .single<{
      id: string;
      workspace_id: string;
      subscription_id: string;
      network_id: string;
      bot_id: string;
      api_key_hash: string;
    }>();

  if (!row?.api_key_hash) {
    return { error: "Invalid API key" };
  }

  const isValid = await verifyApiKey(extracted.key, row.api_key_hash);
  if (!isValid) {
    return { error: "Invalid API key" };
  }

  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    workspaceId: row.workspace_id,
    apiKeyId: row.id,
    subscriptionId: row.subscription_id,
    networkId: row.network_id,
    botId: row.bot_id,
  };
}
