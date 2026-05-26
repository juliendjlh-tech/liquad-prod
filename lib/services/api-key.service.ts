// ---------------------------------------------------------------------------
// API Key service
//
// CRUD for consumer-side api_keys. Since migration 041 an API key is an
// immutable triple:
//   - subscription_id : the prepaid wallet that pays for grants
//   - network_id      : the catalogue bundle the key can reach
//   - bot_id          : the bot identity claimed at /licenses time
//
// At INSERT time the DB trigger validate_api_key_bot_in_network enforces that
// bot_id is referenced by at least one accepted catalogue in the network. We
// also pre-check in TS for a friendlier error response.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generateApiKey, hashApiKey } from "@/lib/services/workspace.service";
import { getNetworkDerivedBotIds } from "@/lib/db/queries/networks";
import { generatePublicId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateApiKeyInput {
  label?: string;
  /** Existing subscription this key debits. */
  subscriptionId: string;
  /** Network whose accepted catalogues this key can reach. */
  networkId: string;
  /** Bot identity the key claims at /licenses time. */
  botId: string;
}

export interface ApiKeyPublic {
  id: string;
  label: string | null;
  api_key_prefix: string;
  subscription_id: string;
  subscription_label: string | null;
  subscription_external_user_id: string | null;
  subscription_balance_eur: number;
  network_id: string;
  network_name: string | null;
  bot_id: string;
  bot_name: string | null;
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
 * Validations:
 *   - subscriptionId must belong to the workspace and be non-archived
 *   - networkId must belong to the workspace
 *   - botId must be in the network's derived bot set (UI + DB trigger)
 */
export async function createApiKey(
  workspaceId: string,
  userId: string,
  input: CreateApiKeyInput
): Promise<{ api_key: string; record: ApiKeyPublic }> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  // 1. Subscription ownership.
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("id", input.subscriptionId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");

  // 2. Network ownership.
  const { data: network } = await supabase
    .from("networks")
    .select("id")
    .eq("id", input.networkId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!network) throw new Error("NETWORK_NOT_FOUND");

  // 3. Pre-check bot ∈ derived set. The DB trigger enforces the same; we do it
  //    in TS to return a clean 422 before hashing the key etc. There is a tiny
  //    race window (catalogue revoked between this check and INSERT) — the
  //    trigger will catch it and raise check_violation.
  const derivedBots = await getNetworkDerivedBotIds(input.networkId);
  if (!derivedBots.includes(input.botId)) {
    throw new Error("BOT_NOT_DERIVED_FROM_NETWORK");
  }

  // 4. Mint + insert.
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = apiKey.slice(0, 11);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      public_id: generatePublicId("key"),
      workspace_id: workspaceId,
      subscription_id: input.subscriptionId,
      network_id: input.networkId,
      bot_id: input.botId,
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix,
      label: input.label ?? null,
    })
    .select(
      "id, label, api_key_prefix, subscription_id, network_id, bot_id, last_used_at, created_at, revoked_at",
    )
    .single();

  if (error || !data) {
    // The trigger raises with ERRCODE=check_violation when the bot is no
    // longer derived (race between TS check and INSERT).
    if (error?.code === "23514" || error?.message?.includes("bot_not_derived_from_network")) {
      throw new Error("BOT_NOT_DERIVED_FROM_NETWORK");
    }
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  // 5. Hydrate response.
  const [{ data: sub }, { data: net }, { data: bot }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("label, external_user_id, balance_eur")
      .eq("id", data.subscription_id)
      .single(),
    supabase.from("networks").select("name").eq("id", data.network_id).single(),
    supabase.from("bots").select("name").eq("id", data.bot_id).single(),
  ]);

  return {
    api_key: apiKey,
    record: {
      ...data,
      subscription_label: sub?.label ?? null,
      subscription_external_user_id: sub?.external_user_id ?? null,
      subscription_balance_eur: Number(sub?.balance_eur ?? 0),
      network_name: net?.name ?? null,
      bot_name: bot?.name ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listApiKeys(
  workspaceId: string,
  userId: string,
  options?: { subscriptionId?: string; networkId?: string }
): Promise<ApiKeyPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  type ApiKeyRow = {
    id: string;
    label: string | null;
    api_key_prefix: string;
    subscription_id: string;
    network_id: string;
    bot_id: string;
    last_used_at: string | null;
    created_at: string;
    revoked_at: string | null;
    subscriptions: { label: string | null; external_user_id: string | null; balance_eur: number } | null;
    networks: { name: string } | null;
    bots: { name: string } | null;
  };

  const baseQuery = supabase
    .from("api_keys")
    .select(
      "id, label, api_key_prefix, subscription_id, network_id, bot_id, last_used_at, created_at, revoked_at, " +
        "subscriptions(label, external_user_id, balance_eur), " +
        "networks(name), " +
        "bots:bot_id(name)",
    )
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  // Type cast needed: the `bots:bot_id(name)` alias syntax isn't parsed by the
  // Supabase type generator and returns GenericStringError. Runtime behaviour is correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = baseQuery as any;

  if (options?.subscriptionId) query = query.eq("subscription_id", options.subscriptionId);
  if (options?.networkId) query = query.eq("network_id", options.networkId);

  const { data, error } = await query as { data: ApiKeyRow[] | null; error: { message: string } | null };

  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  return (data ?? []).map((row: ApiKeyRow) => {
    const subscription = row.subscriptions;
    const network = row.networks;
    const bot = row.bots;
    return {
      id: row.id,
      label: row.label,
      api_key_prefix: row.api_key_prefix,
      subscription_id: row.subscription_id,
      subscription_label: subscription?.label ?? null,
      subscription_external_user_id: subscription?.external_user_id ?? null,
      subscription_balance_eur: Number(subscription?.balance_eur ?? 0),
      network_id: row.network_id,
      network_name: network?.name ?? null,
      bot_id: row.bot_id,
      bot_name: bot?.name ?? null,
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
