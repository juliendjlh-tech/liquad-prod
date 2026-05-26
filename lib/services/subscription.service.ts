// ---------------------------------------------------------------------------
// Subscription service
//
// Since migration 041 a subscription is a pure prepaid wallet held by a
// workspace (the "sub manager"). It carries:
//   - balance_eur: the spendable balance
//   - label / external_user_id: book-keeping metadata
//
// Access scope, catalog allowlists and price caps moved out of subscriptions
// in migration 041. Catalogue scope is now driven by the API key's network
// (api_keys.network_id → network_catalogs accepted).
//
// API keys point at a subscription; multiple keys per subscription is the
// usual rotation pattern, so revoking a key never touches the balance.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generatePublicId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateSubscriptionInput {
  externalUserId?: string | null;
  label?: string | null;
}

export interface UpdateSubscriptionInput {
  label?: string | null;
  externalUserId?: string | null;
}

export interface SubscriptionPublic {
  id: string;
  workspace_id: string;
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

function toPublic(row: {
  id: string;
  workspace_id: string;
  external_user_id: string | null;
  label: string | null;
  balance_eur: number | string;
  created_at: string | null;
  archived_at: string | null;
}, activeKeys: number): SubscriptionPublic {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    external_user_id: row.external_user_id,
    label: row.label,
    balance_eur: Number(row.balance_eur),
    active_keys: activeKeys,
    created_at: row.created_at,
    archived_at: row.archived_at,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new empty subscription. The creating workspace becomes the sub
 * manager — it will receive the 7% share at debit time when this subscription
 * is used.
 *
 * Throws SUBSCRIPTION_DUPLICATE if external_user_id collides with an existing
 * non-archived subscription in the same workspace.
 */
export async function createSubscription(
  workspaceId: string,
  userId: string,
  input: CreateSubscriptionInput
): Promise<SubscriptionPublic> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      public_id: generatePublicId("sub"),
      workspace_id: workspaceId,
      external_user_id: input.externalUserId ?? null,
      label: input.label ?? null,
    })
    .select("id, workspace_id, external_user_id, label, balance_eur, created_at, archived_at")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new Error("SUBSCRIPTION_DUPLICATE");
    }
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  return toPublic(data, 0);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List non-archived subscriptions for a workspace, with active key count.
 */
export async function listSubscriptions(
  workspaceId: string,
  userId: string,
): Promise<SubscriptionPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  const { data: subscriptions, error } = await supabase
    .from("subscriptions")
    .select("id, workspace_id, external_user_id, label, balance_eur, created_at, archived_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  const rows = subscriptions ?? [];
  const subscriptionIds = rows.map((s) => s.id);
  const keyCounts = new Map<string, number>();

  if (subscriptionIds.length > 0) {
    const { data: keys } = await supabase
      .from("api_keys")
      .select("subscription_id")
      .in("subscription_id", subscriptionIds)
      .is("revoked_at", null);

    for (const k of keys ?? []) {
      keyCounts.set(k.subscription_id, (keyCounts.get(k.subscription_id) ?? 0) + 1);
    }
  }

  return rows.map((row) => toPublic(row, keyCounts.get(row.id) ?? 0));
}

// ---------------------------------------------------------------------------
// Update (label / external_user_id only)
// ---------------------------------------------------------------------------

export async function updateSubscription(
  workspaceId: string,
  userId: string,
  subscriptionId: string,
  input: UpdateSubscriptionInput
): Promise<SubscriptionPublic> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("id", subscriptionId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!existing) throw new Error("NOT_FOUND");

  const update: Record<string, unknown> = {};
  if (input.label !== undefined) update.label = input.label;
  if (input.externalUserId !== undefined) update.external_user_id = input.externalUserId;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from("subscriptions")
      .update(update)
      .eq("id", subscriptionId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(`UPDATE_FAILED: ${error.message}`);
  }

  const all = await listSubscriptions(workspaceId, userId);
  const match = all.find((s) => s.id === subscriptionId);
  if (!match) throw new Error("NOT_FOUND");
  return match;
}

// ---------------------------------------------------------------------------
// Archive (soft delete)
// ---------------------------------------------------------------------------

/**
 * Soft-archive a subscription. Fails if balance > 0.
 * Revokes all non-revoked API keys pointing at the subscription.
 */
export async function archiveSubscription(
  workspaceId: string,
  userId: string,
  subscriptionId: string
): Promise<void> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, balance_eur")
    .eq("id", subscriptionId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!subscription) throw new Error("NOT_FOUND");
  if (Number(subscription.balance_eur) > 0) throw new Error("SUBSCRIPTION_HAS_BALANCE");

  const now = new Date().toISOString();

  await supabase
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("subscription_id", subscriptionId)
    .is("revoked_at", null);

  const { error } = await supabase
    .from("subscriptions")
    .update({ archived_at: now })
    .eq("id", subscriptionId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(`ARCHIVE_FAILED: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Credit (MVP: admin top-up)
// ---------------------------------------------------------------------------

/**
 * Credit a subscription via its owning workspace (dashboard-driven top-up).
 * Uses an active api_key as the idempotency anchor for the RPC signature.
 *
 * NOTE: in the network model, all subscriptions can be topped up by their
 * owning workspace — the "publisher" vs "access" mode distinction is gone.
 * If you need to gate top-ups by some product policy, do it at the UI layer.
 */
export async function creditSubscriptionAsAdmin(
  workspaceId: string,
  userId: string,
  subscriptionId: string,
  amountEur: number,
  description?: string
): Promise<{ new_balance: number; transaction_id: string }> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const supabase = await createServerClient();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("id", subscriptionId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!subscription) throw new Error("NOT_FOUND");

  const { data: anchorKey } = await supabase
    .from("api_keys")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!anchorKey) throw new Error("NO_ACTIVE_KEY");

  const { data: rpcData, error: rpcError } = await supabase.rpc("credit_subscription", {
    p_api_key_id: anchorKey.id,
    p_amount_eur: amountEur,
    p_external_ref: undefined,
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
