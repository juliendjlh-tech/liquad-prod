// ---------------------------------------------------------------------------
// Wallet service
//
// Multi-tenant budgets per bot. A wallet is the financial account that holds
// credit for one end-user of a consumer operating a bot. API keys are the
// credentials pointing at the wallet; they are rotatable, wallets are not.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateWalletInput {
  agentId: string;
  externalUserId?: string | null;
  label?: string | null;
}

export interface WalletPublic {
  id: string;
  workspace_id: string;
  agent_id: string;
  agent_name: string;
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
 * Create a new empty wallet for a (workspace, agent) pair.
 * The agent must already be subscribed to the workspace (workspace_agents row).
 *
 * Throws AGENT_NOT_IN_WORKSPACE if not subscribed.
 * Throws WALLET_DUPLICATE if external_user_id collides with an existing wallet.
 */
export async function createWallet(
  workspaceId: string,
  userId: string,
  input: CreateWalletInput
): Promise<WalletPublic> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data: link } = await supabase
    .from("workspace_agents")
    .select("agent_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", input.agentId)
    .maybeSingle();

  if (!link) throw new Error("AGENT_NOT_IN_WORKSPACE");

  const { data, error } = await supabase
    .from("wallets")
    .insert({
      workspace_id: workspaceId,
      agent_id: input.agentId,
      external_user_id: input.externalUserId ?? null,
      label: input.label ?? null,
    })
    .select("id, workspace_id, agent_id, external_user_id, label, balance_eur, created_at, archived_at")
    .single();

  if (error || !data) {
    // Partial UNIQUE on (workspace_id, agent_id, external_user_id) where external_user_id IS NOT NULL
    if (error?.code === "23505") {
      throw new Error("WALLET_DUPLICATE");
    }
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("name")
    .eq("id", input.agentId)
    .single();

  return {
    ...data,
    balance_eur: Number(data.balance_eur),
    agent_name: agent?.name ?? "unknown",
    active_keys: 0,
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List non-archived wallets for a workspace. Optionally filter by agent.
 * Includes a count of active (non-revoked) API keys per wallet.
 */
export async function listWallets(
  workspaceId: string,
  userId: string,
  options?: { agentId?: string }
): Promise<WalletPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  let query = supabase
    .from("wallets")
    .select("id, workspace_id, agent_id, external_user_id, label, balance_eur, created_at, archived_at, agents(name)")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (options?.agentId) {
    query = query.eq("agent_id", options.agentId);
  }

  const { data: wallets, error } = await query;
  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  const walletIds = (wallets ?? []).map((w) => w.id);
  const keyCounts = new Map<string, number>();

  if (walletIds.length > 0) {
    const { data: keys } = await supabase
      .from("api_keys")
      .select("wallet_id")
      .in("wallet_id", walletIds)
      .is("revoked_at", null);

    for (const k of keys ?? []) {
      keyCounts.set(k.wallet_id, (keyCounts.get(k.wallet_id) ?? 0) + 1);
    }
  }

  return (wallets ?? []).map((row) => {
    const agents = row.agents as { name: string } | null;
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      agent_id: row.agent_id,
      agent_name: agents?.name ?? "unknown",
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
 * Soft-archive a wallet. Fails if balance > 0 (funds must be refunded first).
 * Revokes all non-revoked API keys pointing at the wallet.
 */
export async function archiveWallet(
  workspaceId: string,
  userId: string,
  walletId: string
): Promise<void> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, balance_eur")
    .eq("id", walletId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!wallet) throw new Error("NOT_FOUND");
  if (Number(wallet.balance_eur) > 0) throw new Error("WALLET_HAS_BALANCE");

  const now = new Date().toISOString();

  // Revoke all active keys for this wallet first — the wallet is going away.
  await supabase
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("wallet_id", walletId)
    .is("revoked_at", null);

  const { error } = await supabase
    .from("wallets")
    .update({ archived_at: now })
    .eq("id", walletId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(`ARCHIVE_FAILED: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Credit (MVP: admin top-up)
// ---------------------------------------------------------------------------

/**
 * Credit a wallet via its owning workspace (dashboard-driven top-up).
 * For MVP, this is triggered by an admin in the UI. When Stripe lands, the
 * credit_wallet RPC will be called from the webhook handler instead.
 *
 * Uses an active api_key of the wallet as the idempotency anchor, since the
 * RPC signature takes p_api_key_id. Falls back to an error if no active key.
 */
export async function creditWalletAsAdmin(
  workspaceId: string,
  userId: string,
  walletId: string,
  amountEur: number,
  description?: string
): Promise<{ new_balance: number; transaction_id: string }> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const supabase = await createServerClient();

  // Scope check + find an anchor api_key for this wallet.
  const { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("id", walletId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!wallet) throw new Error("NOT_FOUND");

  const { data: anchorKey } = await supabase
    .from("api_keys")
    .select("id")
    .eq("wallet_id", walletId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!anchorKey) throw new Error("NO_ACTIVE_KEY");

  const { data: rpcData, error: rpcError } = await supabase.rpc("credit_wallet", {
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
