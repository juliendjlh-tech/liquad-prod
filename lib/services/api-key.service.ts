// ---------------------------------------------------------------------------
// API Key service
//
// CRUD for consumer-side api_keys. Each key points to a workspace-scoped
// subscription. The bot identity is no longer carried by the credential —
// it is provided per /licenses call (since migration 032).
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generateApiKey, hashApiKey } from "@/lib/services/workspace.service";
import { isBotActiveForWorkspace } from "@/lib/db/queries/agents";
import type { SubscriptionMode } from "@/lib/services/subscription.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateApiKeyInput {
  label?: string;
  /**
   * Existing subscription to attach this key to. When omitted, a new
   * subscription is created implicitly and the key is the first credential
   * on it.
   */
  subscriptionId?: string;
  /**
   * Mode under which to create the implicit subscription when subscriptionId
   * is omitted. Required in that case; ignored when attaching to an existing
   * subscription.
   */
  mode?: SubscriptionMode;
  /** Used when subscriptionId is omitted — label for the implicitly-created subscription. */
  subscriptionLabel?: string;
  /** Used when subscriptionId is omitted — external user id mapped to the new subscription. */
  subscriptionExternalUserId?: string;
  /**
   * Optional default bot used as fallback by /licenses when body.bot_id is
   * omitted. Must belong to the workspace's workspace_bots at creation time.
   */
  defaultBotId?: string;
}

export interface ApiKeyPublic {
  id: string;
  label: string | null;
  api_key_prefix: string;
  subscription_id: string;
  subscription_label: string | null;
  subscription_external_user_id: string | null;
  subscription_balance_eur: number;
  default_bot_id: string | null;
  default_bot_name: string | null;
  last_used_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * If input.subscriptionId is provided, the key is attached to that
 * subscription (must belong to the same workspace). Otherwise a new
 * subscription is created and this key becomes its first credential.
 */
export async function createApiKey(
  workspaceId: string,
  userId: string,
  input: CreateApiKeyInput
): Promise<{ api_key: string; record: ApiKeyPublic }> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  // Validate default_bot_id (if provided) belongs to the workspace's bots.
  if (input.defaultBotId) {
    const inWorkspace = await isBotActiveForWorkspace(input.defaultBotId, workspaceId);
    if (!inWorkspace) throw new Error("BOT_NOT_IN_WORKSPACE");
  }

  let subscriptionId: string;

  if (input.subscriptionId) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("id", input.subscriptionId)
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .maybeSingle();

    if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");
    subscriptionId = subscription.id;
  } else {
    if (!input.mode) throw new Error("MODE_REQUIRED");

    if (input.mode === "publisher") {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("is_publisher")
        .eq("id", workspaceId)
        .single();
      if (!workspace?.is_publisher) throw new Error("PUBLISHER_DISABLED");
    }

    const scopeToWorkspace = input.mode === "publisher";
    const externalUserId =
      input.mode === "publisher" ? input.subscriptionExternalUserId ?? null : null;

    const { data: newSubscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .insert({
        workspace_id: workspaceId,
        label: input.subscriptionLabel ?? null,
        external_user_id: externalUserId,
        scope_to_workspace: scopeToWorkspace,
      })
      .select("id")
      .single();

    if (subscriptionError || !newSubscription) {
      if (subscriptionError?.code === "23505") throw new Error("SUBSCRIPTION_DUPLICATE");
      throw new Error(`SUBSCRIPTION_CREATE_FAILED: ${subscriptionError?.message ?? "unknown"}`);
    }
    subscriptionId = newSubscription.id;
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = apiKey.slice(0, 11);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      workspace_id: workspaceId,
      subscription_id: subscriptionId,
      default_bot_id: input.defaultBotId ?? null,
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix,
      label: input.label ?? null,
    })
    .select(
      "id, label, api_key_prefix, subscription_id, default_bot_id, last_used_at, created_at, revoked_at"
    )
    .single();

  if (error || !data) {
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  const [{ data: subscription }, { data: bot }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("label, external_user_id, balance_eur")
      .eq("id", subscriptionId)
      .single(),
    input.defaultBotId
      ? supabase.from("bots").select("name").eq("id", input.defaultBotId).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    api_key: apiKey,
    record: {
      ...data,
      subscription_label: subscription?.label ?? null,
      subscription_external_user_id: subscription?.external_user_id ?? null,
      subscription_balance_eur: Number(subscription?.balance_eur ?? 0),
      default_bot_name: bot?.name ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listApiKeys(
  workspaceId: string,
  userId: string,
  options?: { subscriptionId?: string }
): Promise<ApiKeyPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  let query = supabase
    .from("api_keys")
    .select(
      "id, label, api_key_prefix, subscription_id, default_bot_id, last_used_at, created_at, revoked_at, subscriptions(label, external_user_id, balance_eur), bots:default_bot_id(name)"
    )
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (options?.subscriptionId) query = query.eq("subscription_id", options.subscriptionId);

  const { data, error } = await query;

  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  return (data ?? []).map((row) => {
    const subscription = row.subscriptions as {
      label: string | null;
      external_user_id: string | null;
      balance_eur: number;
    } | null;
    const bot = row.bots as { name: string } | null;
    return {
      id: row.id,
      label: row.label,
      api_key_prefix: row.api_key_prefix,
      subscription_id: row.subscription_id,
      subscription_label: subscription?.label ?? null,
      subscription_external_user_id: subscription?.external_user_id ?? null,
      subscription_balance_eur: Number(subscription?.balance_eur ?? 0),
      default_bot_id: row.default_bot_id,
      default_bot_name: bot?.name ?? null,
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      revoked_at: row.revoked_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

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
