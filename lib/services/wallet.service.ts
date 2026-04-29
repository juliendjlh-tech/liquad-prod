// ---------------------------------------------------------------------------
// Bot subscription service
//
// Multi-tenant budgets per bot. A bot subscription is the financial account
// that holds credit for one end-user of a consumer operating a bot. API keys
// are the credentials pointing at the bot subscription; they are rotatable,
// bot subscriptions are not.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateBotSubscriptionInput {
  botId: string;
  externalUserId?: string | null;
  label?: string | null;
}

export interface BotSubscriptionPublic {
  id: string;
  workspace_id: string;
  bot_id: string;
  bot_name: string;
  external_user_id: string | null;
  label: string | null;
  balance_eur: number;
  active_keys: number;
  created_at: string | null;
  archived_at: string | null;
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
 * Create a new empty bot subscription for a (workspace, bot) pair.
 * The bot must already be subscribed to the workspace (workspace_bots row).
 *
 * Throws BOT_NOT_IN_WORKSPACE if not subscribed.
 * Throws BOT_SUBSCRIPTION_DUPLICATE if external_user_id collides with an existing bot subscription.
 */
export async function createBotSubscription(
  workspaceId: string,
  userId: string,
  input: CreateBotSubscriptionInput
): Promise<BotSubscriptionPublic> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data: link } = await supabase
    .from("workspace_bots")
    .select("bot_id")
    .eq("workspace_id", workspaceId)
    .eq("bot_id", input.botId)
    .maybeSingle();

  if (!link) throw new Error("BOT_NOT_IN_WORKSPACE");

  const { data, error } = await supabase
    .from("bot_subscriptions")
    .insert({
      workspace_id: workspaceId,
      bot_id: input.botId,
      external_user_id: input.externalUserId ?? null,
      label: input.label ?? null,
    })
    .select("id, workspace_id, bot_id, external_user_id, label, balance_eur, created_at, archived_at")
    .single();

  if (error || !data) {
    // Partial UNIQUE on (workspace_id, bot_id, external_user_id) where external_user_id IS NOT NULL
    if (error?.code === "23505") {
      throw new Error("BOT_SUBSCRIPTION_DUPLICATE");
    }
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  const { data: bot } = await supabase
    .from("bots")
    .select("name")
    .eq("id", input.botId)
    .single();

  return {
    ...data,
    balance_eur: Number(data.balance_eur),
    bot_name: bot?.name ?? "unknown",
    active_keys: 0,
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List non-archived bot subscriptions for a workspace. Optionally filter by bot.
 * Includes a count of active (non-revoked) API keys per bot subscription.
 */
export async function listBotSubscriptions(
  workspaceId: string,
  userId: string,
  options?: { botId?: string }
): Promise<BotSubscriptionPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  let query = supabase
    .from("bot_subscriptions")
    .select("id, workspace_id, bot_id, external_user_id, label, balance_eur, created_at, archived_at, bots(name)")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (options?.botId) {
    query = query.eq("bot_id", options.botId);
  }

  const { data: botSubscriptions, error } = await query;
  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  const botSubscriptionIds = (botSubscriptions ?? []).map((w) => w.id);
  const keyCounts = new Map<string, number>();

  if (botSubscriptionIds.length > 0) {
    const { data: keys } = await supabase
      .from("api_keys")
      .select("bot_subscription_id")
      .in("bot_subscription_id", botSubscriptionIds)
      .is("revoked_at", null);

    for (const k of keys ?? []) {
      keyCounts.set(k.bot_subscription_id, (keyCounts.get(k.bot_subscription_id) ?? 0) + 1);
    }
  }

  return (botSubscriptions ?? []).map((row) => {
    const bots = row.bots as { name: string } | null;
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      bot_id: row.bot_id,
      bot_name: bots?.name ?? "unknown",
      external_user_id: row.external_user_id,
      label: row.label,
      balance_eur: Number(row.balance_eur),
      active_keys: keyCounts.get(row.id) ?? 0,
      created_at: row.created_at,
      archived_at: row.archived_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Archive (soft delete)
// ---------------------------------------------------------------------------

/**
 * Soft-archive a bot subscription. Fails if balance > 0 (funds must be refunded first).
 * Revokes all non-revoked API keys pointing at the bot subscription.
 */
export async function archiveBotSubscription(
  workspaceId: string,
  userId: string,
  botSubscriptionId: string
): Promise<void> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data: botSubscription } = await supabase
    .from("bot_subscriptions")
    .select("id, balance_eur")
    .eq("id", botSubscriptionId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!botSubscription) throw new Error("NOT_FOUND");
  if (Number(botSubscription.balance_eur) > 0) throw new Error("BOT_SUBSCRIPTION_HAS_BALANCE");

  const now = new Date().toISOString();

  // Revoke all active keys for this bot subscription first — the bot subscription is going away.
  await supabase
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("bot_subscription_id", botSubscriptionId)
    .is("revoked_at", null);

  const { error } = await supabase
    .from("bot_subscriptions")
    .update({ archived_at: now })
    .eq("id", botSubscriptionId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(`ARCHIVE_FAILED: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Credit (MVP: admin top-up)
// ---------------------------------------------------------------------------

/**
 * Credit a bot subscription via its owning workspace (dashboard-driven top-up).
 * For MVP, this is triggered by an admin in the UI. When Stripe lands, the
 * credit_bot_subscription RPC will be called from the webhook handler instead.
 *
 * Uses an active api_key of the bot subscription as the idempotency anchor, since the
 * RPC signature takes p_api_key_id. Falls back to an error if no active key.
 */
export async function creditBotSubscriptionAsAdmin(
  workspaceId: string,
  userId: string,
  botSubscriptionId: string,
  amountEur: number,
  description?: string
): Promise<{ new_balance: number; transaction_id: string }> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const supabase = await createServerClient();

  // Scope check + find an anchor api_key for this bot subscription.
  const { data: botSubscription } = await supabase
    .from("bot_subscriptions")
    .select("id")
    .eq("id", botSubscriptionId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!botSubscription) throw new Error("NOT_FOUND");

  const { data: anchorKey } = await supabase
    .from("api_keys")
    .select("id")
    .eq("bot_subscription_id", botSubscriptionId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!anchorKey) throw new Error("NO_ACTIVE_KEY");

  const { data: rpcData, error: rpcError } = await supabase.rpc("credit_bot_subscription", {
    p_api_key_id: anchorKey.id,
    p_amount_eur: amountEur,
    p_external_ref: null,
    p_description: description ?? "Admin top-up",
  });

  if (rpcError) throw new Error(`CREDIT_FAILED: ${rpcError.message}`);

  const result = rpcData as unknown as {
    success: boolean;
    new_balance: number;
    transaction_id: string;
  };

  return {
    new_balance: Number(result.new_balance),
    transaction_id: result.transaction_id,
  };
}
