// ---------------------------------------------------------------------------
// Subscription service
//
// A subscription is a workspace-scoped financial account holding prepaid
// credit. Since migration 032, subscriptions are bot-agnostic — the bot
// identity is provided per /licenses call (validated against workspace_bots),
// not bound to the subscription nor the API key.
//
// API keys point at a subscription; multiple keys per subscription is the
// usual rotation pattern, so revoking a key never touches the balance.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubscriptionMode = "publisher" | "access";

export interface CreateSubscriptionInput {
  externalUserId?: string | null;
  label?: string | null;
  /**
   * Mode under which the subscription is created. Determines scope_to_workspace
   * deterministically: 'publisher' → true (workspace catalogs only, sold to
   * partners), 'access' → false (network access, used by the workspace itself).
   * The scope is immutable after creation.
   */
  mode: SubscriptionMode;
}

export interface SubscriptionPublic {
  id: string;
  workspace_id: string;
  external_user_id: string | null;
  label: string | null;
  balance_eur: number;
  active_keys: number;
  /**
   * true (default) → subscription only sees catalogs of its workspace
   *   (end-user mode: sold to partners/customers).
   * false → opt-in network access; subscription sees all matching network
   *   catalogs and the wallet is debited (client mode: workspace as end-user).
   */
  scope_to_workspace: boolean;
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
 * Create a new empty subscription for a workspace.
 *
 * Throws SUBSCRIPTION_DUPLICATE if external_user_id collides with an
 * existing subscription in the same workspace.
 */
export async function createSubscription(
  workspaceId: string,
  userId: string,
  input: CreateSubscriptionInput
): Promise<SubscriptionPublic> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  if (input.mode === "publisher") {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("is_publisher")
      .eq("id", workspaceId)
      .single();
    if (!workspace?.is_publisher) {
      throw new Error("PUBLISHER_DISABLED");
    }
  }

  const scopeToWorkspace = input.mode === "publisher";

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      workspace_id: workspaceId,
      external_user_id:
        input.mode === "publisher" ? input.externalUserId ?? null : null,
      label: input.label ?? null,
      scope_to_workspace: scopeToWorkspace,
    })
    .select(
      "id, workspace_id, external_user_id, label, balance_eur, scope_to_workspace, created_at, archived_at"
    )
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new Error("SUBSCRIPTION_DUPLICATE");
    }
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  return {
    ...data,
    balance_eur: Number(data.balance_eur),
    active_keys: 0,
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List non-archived subscriptions for a workspace, with active key count.
 *
 * When `mode` is provided, the result is restricted to subscriptions that
 * belong to that mode: `publisher` returns scope_to_workspace=true rows,
 * `access` returns scope_to_workspace=false rows.
 */
export async function listSubscriptions(
  workspaceId: string,
  userId: string,
  mode?: SubscriptionMode
): Promise<SubscriptionPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  let query = supabase
    .from("subscriptions")
    .select(
      "id, workspace_id, external_user_id, label, balance_eur, scope_to_workspace, created_at, archived_at"
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (mode) {
    query = query.eq("scope_to_workspace", mode === "publisher");
  }

  const { data: subscriptions, error } = await query;

  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  const subscriptionIds = (subscriptions ?? []).map((s) => s.id);
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

  return (subscriptions ?? []).map((row) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    external_user_id: row.external_user_id,
    label: row.label,
    balance_eur: Number(row.balance_eur),
    active_keys: keyCounts.get(row.id) ?? 0,
    scope_to_workspace: row.scope_to_workspace,
    created_at: row.created_at,
    archived_at: row.archived_at,
  }));
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

// Scope is now derived from the creation mode and immutable; the historical
// setSubscriptionScope helper has been removed. The /scope HTTP route returns
// 410 Gone for clients still pointing at it.
