// ---------------------------------------------------------------------------
// API Key service (ADR-006, wallets entity since migration 025)
//
// CRUD for consumer-side api_keys. Each key is bound to an agent (bot) AND a
// wallet. Multiple keys can point at the same wallet (rotation / per-env), so
// revoking a key never touches the wallet's balance. This separation is by
// design — revocation is unconditional even if the wallet still has credit.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generateApiKey, hashApiKey } from "@/lib/services/workspace.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateApiKeyInput {
  agentId: string;
  label?: string;
  /**
   * Existing wallet to attach this key to. When omitted, a new wallet is
   * created implicitly and the key is the first credential on it.
   */
  walletId?: string;
  /** Used when walletId is omitted — label for the implicitly-created wallet. */
  walletLabel?: string;
  /** Used when walletId is omitted — external user id mapped to the new wallet. */
  walletExternalUserId?: string;
}

export interface ApiKeyPublic {
  id: string;
  label: string | null;
  api_key_prefix: string;
  agent_id: string;
  agent_name: string;
  wallet_id: string;
  wallet_label: string | null;
  wallet_external_user_id: string | null;
  wallet_balance_eur: number;
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
 * The agent must already be subscribed to the workspace (workspace_agents row).
 * If input.walletId is provided, the key is attached to that wallet (must
 * match the same workspace+agent). Otherwise, a new empty wallet is created
 * and the key becomes its first credential.
 */
export async function createApiKey(
  workspaceId: string,
  userId: string,
  input: CreateApiKeyInput
): Promise<{ api_key: string; record: ApiKeyPublic }> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  // Scope check: the agent must be subscribed in this workspace.
  const { data: link } = await supabase
    .from("workspace_agents")
    .select("agent_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", input.agentId)
    .maybeSingle();

  if (!link) throw new Error("AGENT_NOT_IN_WORKSPACE");

  // Resolve the target wallet: either provided, or freshly created.
  let walletId: string;

  if (input.walletId) {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id")
      .eq("id", input.walletId)
      .eq("workspace_id", workspaceId)
      .eq("agent_id", input.agentId)
      .is("archived_at", null)
      .maybeSingle();

    if (!wallet) throw new Error("WALLET_NOT_FOUND");
    walletId = wallet.id;
  } else {
    const { data: newWallet, error: walletError } = await supabase
      .from("wallets")
      .insert({
        workspace_id: workspaceId,
        agent_id: input.agentId,
        label: input.walletLabel ?? null,
        external_user_id: input.walletExternalUserId ?? null,
      })
      .select("id")
      .single();

    if (walletError || !newWallet) {
      if (walletError?.code === "23505") throw new Error("WALLET_DUPLICATE");
      throw new Error(`WALLET_CREATE_FAILED: ${walletError?.message ?? "unknown"}`);
    }
    walletId = newWallet.id;
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = apiKey.slice(0, 11);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      workspace_id: workspaceId,
      agent_id: input.agentId,
      wallet_id: walletId,
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix,
      label: input.label ?? null,
    })
    .select(
      "id, label, api_key_prefix, agent_id, wallet_id, last_used_at, created_at, revoked_at"
    )
    .single();

  if (error || !data) {
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  const [{ data: agent }, { data: wallet }] = await Promise.all([
    supabase.from("agents").select("name").eq("id", input.agentId).single(),
    supabase
      .from("wallets")
      .select("label, external_user_id, balance_eur")
      .eq("id", walletId)
      .single(),
  ]);

  return {
    api_key: apiKey,
    record: {
      ...data,
      agent_name: agent?.name ?? "unknown",
      wallet_label: wallet?.label ?? null,
      wallet_external_user_id: wallet?.external_user_id ?? null,
      wallet_balance_eur: Number(wallet?.balance_eur ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List non-revoked API keys for a workspace (member can read).
 * Filterable by agent_id or wallet_id (UI typically scopes by wallet now).
 */
export async function listApiKeys(
  workspaceId: string,
  userId: string,
  options?: { agentId?: string; walletId?: string }
): Promise<ApiKeyPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  let query = supabase
    .from("api_keys")
    .select(
      "id, label, api_key_prefix, agent_id, wallet_id, last_used_at, created_at, revoked_at, agents(name), wallets(label, external_user_id, balance_eur)"
    )
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (options?.agentId) query = query.eq("agent_id", options.agentId);
  if (options?.walletId) query = query.eq("wallet_id", options.walletId);

  const { data, error } = await query;

  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  return (data ?? []).map((row) => {
    const agents = row.agents as { name: string } | null;
    const wallet = row.wallets as {
      label: string | null;
      external_user_id: string | null;
      balance_eur: number;
    } | null;
    return {
      id: row.id,
      label: row.label,
      api_key_prefix: row.api_key_prefix,
      agent_id: row.agent_id,
      agent_name: agents?.name ?? "unknown",
      wallet_id: row.wallet_id,
      wallet_label: wallet?.label ?? null,
      wallet_external_user_id: wallet?.external_user_id ?? null,
      wallet_balance_eur: Number(wallet?.balance_eur ?? 0),
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
 * wallet's balance. A revoked key no longer authenticates, but the funds on
 * the wallet are preserved and spendable via any other active key on it.
 * This is the core reason balance lives on wallets (see migration 025).
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
