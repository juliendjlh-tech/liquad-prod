// ---------------------------------------------------------------------------
// API Key service (ADR-006, bot_subscriptions entity since migration 025)
//
// CRUD for consumer-side api_keys. Each key is bound to a bot AND a
// bot subscription. Multiple keys can point at the same bot subscription
// (rotation / per-env), so revoking a key never touches the subscription's
// balance. This separation is by design — revocation is unconditional even
// if the subscription still has credit.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generateApiKey, hashApiKey } from "@/lib/services/workspace.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateApiKeyInput {
  botId: string;
  label?: string;
  /**
   * Existing bot subscription to attach this key to. When omitted, a new
   * subscription is created implicitly and the key is the first credential
   * on it.
   */
  botSubscriptionId?: string;
  /** Used when botSubscriptionId is omitted — label for the implicitly-created subscription. */
  botSubscriptionLabel?: string;
  /** Used when botSubscriptionId is omitted — external user id mapped to the new subscription. */
  botSubscriptionExternalUserId?: string;
  /** When true, the new subscription gets network access (scope_to_workspace=false). Default: workspace-only. */
  botSubscriptionNetworkAccess?: boolean;
}

export interface ApiKeyPublic {
  id: string;
  label: string | null;
  api_key_prefix: string;
  bot_id: string;
  bot_name: string;
  bot_subscription_id: string;
  bot_subscription_label: string | null;
  bot_subscription_external_user_id: string | null;
  bot_subscription_balance_eur: number;
  last_used_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Throws:
 *   - "NOT_MEMBER" if the user has no membership on the workspace
 *   - "FORBIDDEN"  if the required role check fails
 */
async function assertRole(
  workspaceId: string,
  userId: string,
  allowed: Array<"owner" | "admin" | "member">
): Promise<void> {
  const supabase = await createServerClient();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (!membership) throw new Error("NOT_MEMBER");
  if (!allowed.includes(membership.role as "owner" | "admin" | "member")) {
    throw new Error("FORBIDDEN");
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new consumer API key. Returns the plaintext key ONCE.
 * Role required: owner or admin on the workspace.
 *
 * The bot must already be subscribed to the workspace (workspace_bots row).
 * If input.botSubscriptionId is provided, the key is attached to that
 * subscription (must match the same workspace+bot). Otherwise, a new empty
 * subscription is created and the key becomes its first credential.
 */
export async function createApiKey(
  workspaceId: string,
  userId: string,
  input: CreateApiKeyInput
): Promise<{ api_key: string; record: ApiKeyPublic }> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  // Scope check: the bot must be subscribed in this workspace.
  const { data: link } = await supabase
    .from("workspace_bots")
    .select("bot_id")
    .eq("workspace_id", workspaceId)
    .eq("bot_id", input.botId)
    .maybeSingle();

  if (!link) throw new Error("BOT_NOT_IN_WORKSPACE");

  // Resolve the target bot subscription: either provided, or freshly created.
  let botSubscriptionId: string;

  if (input.botSubscriptionId) {
    const { data: botSubscription } = await supabase
      .from("bot_subscriptions")
      .select("id")
      .eq("id", input.botSubscriptionId)
      .eq("workspace_id", workspaceId)
      .eq("bot_id", input.botId)
      .is("archived_at", null)
      .maybeSingle();

    if (!botSubscription) throw new Error("BOT_SUBSCRIPTION_NOT_FOUND");
    botSubscriptionId = botSubscription.id;
  } else {
    const { data: newBotSubscription, error: botSubscriptionError } = await supabase
      .from("bot_subscriptions")
      .insert({
        workspace_id: workspaceId,
        bot_id: input.botId,
        label: input.botSubscriptionLabel ?? null,
        external_user_id: input.botSubscriptionExternalUserId ?? null,
        scope_to_workspace: input.botSubscriptionNetworkAccess ? false : true,
      })
      .select("id")
      .single();

    if (botSubscriptionError || !newBotSubscription) {
      if (botSubscriptionError?.code === "23505") throw new Error("BOT_SUBSCRIPTION_DUPLICATE");
      throw new Error(`BOT_SUBSCRIPTION_CREATE_FAILED: ${botSubscriptionError?.message ?? "unknown"}`);
    }
    botSubscriptionId = newBotSubscription.id;
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = apiKey.slice(0, 11);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      workspace_id: workspaceId,
      bot_id: input.botId,
      bot_subscription_id: botSubscriptionId,
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix,
      label: input.label ?? null,
    })
    .select(
      "id, label, api_key_prefix, bot_id, bot_subscription_id, last_used_at, created_at, revoked_at"
    )
    .single();

  if (error || !data) {
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  const [{ data: bot }, { data: botSubscription }] = await Promise.all([
    supabase.from("bots").select("name").eq("id", input.botId).single(),
    supabase
      .from("bot_subscriptions")
      .select("label, external_user_id, balance_eur")
      .eq("id", botSubscriptionId)
      .single(),
  ]);

  return {
    api_key: apiKey,
    record: {
      ...data,
      bot_name: bot?.name ?? "unknown",
      bot_subscription_label: botSubscription?.label ?? null,
      bot_subscription_external_user_id: botSubscription?.external_user_id ?? null,
      bot_subscription_balance_eur: Number(botSubscription?.balance_eur ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List non-revoked API keys for a workspace (member can read).
 * Filterable by bot_id or bot_subscription_id (UI typically scopes by
 * bot subscription now).
 */
export async function listApiKeys(
  workspaceId: string,
  userId: string,
  options?: { botId?: string; botSubscriptionId?: string }
): Promise<ApiKeyPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  let query = supabase
    .from("api_keys")
    .select(
      "id, label, api_key_prefix, bot_id, bot_subscription_id, last_used_at, created_at, revoked_at, bots(name), bot_subscriptions(label, external_user_id, balance_eur)"
    )
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (options?.botId) query = query.eq("bot_id", options.botId);
  if (options?.botSubscriptionId) query = query.eq("bot_subscription_id", options.botSubscriptionId);

  const { data, error } = await query;

  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  return (data ?? []).map((row) => {
    const bots = row.bots as { name: string } | null;
    const botSubscription = row.bot_subscriptions as {
      label: string | null;
      external_user_id: string | null;
      balance_eur: number;
    } | null;
    return {
      id: row.id,
      label: row.label,
      api_key_prefix: row.api_key_prefix,
      bot_id: row.bot_id,
      bot_name: bots?.name ?? "unknown",
      bot_subscription_id: row.bot_subscription_id,
      bot_subscription_label: botSubscription?.label ?? null,
      bot_subscription_external_user_id: botSubscription?.external_user_id ?? null,
      bot_subscription_balance_eur: Number(botSubscription?.balance_eur ?? 0),
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      revoked_at: row.revoked_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

/**
 * Revoke a key immediately (soft delete via revoked_at).
 * Role required: owner or admin. The key must belong to the workspace.
 *
 * Design note: revocation is ALWAYS unconditional — we never check the
 * bot subscription's balance. A revoked key no longer authenticates, but
 * the funds on the subscription are preserved and spendable via any other
 * active key on it. This is the core reason balance lives on bot
 * subscriptions (see migration 025).
 */
export async function revokeApiKey(
  workspaceId: string,
  userId: string,
  apiKeyId: string
): Promise<void> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", apiKeyId)
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`REVOKE_FAILED: ${error.message}`);
  if (!data) throw new Error("NOT_FOUND");
}
