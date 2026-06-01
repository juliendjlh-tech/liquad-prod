// ---------------------------------------------------------------------------
// API Key service
//
// CRUD for consumer-side api_keys. Since migration 045 an API key is a pair:
//   - subscription_id     : the prepaid wallet that pays for grants
//   - access_settings_id  : the consumer plan (bot + catalogues + max_price)
//
// The bot identity is carried by the access_settings, not the key. We keep
// `bot_id` as a denormalized column for fast hot-path queries; the DB trigger
// `trg_api_keys_validate_bot_matches_access_settings` enforces equality.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generateApiKey, hashApiKey } from "@/lib/services/workspace.service";
import { getAccessSettingsById } from "@/lib/db/queries/access-settings";
import { generatePublicId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateApiKeyInput {
  label?: string;
  /** Existing subscription this key debits. */
  subscriptionId: string;
  /** Access settings this key consumes — defines bot + catalogues + max_price. */
  accessSettingsId: string;
}

export interface ApiKeyPublic {
  id: string;
  label: string | null;
  api_key_prefix: string;
  subscription_id: string;
  subscription_public_id: string | null;
  subscription_label: string | null;
  subscription_external_user_id: string | null;
  access_settings_id: string;
  access_settings_name: string | null;
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
  allowed: Array<"owner" | "admin" | "member">,
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
 *   - accessSettingsId must belong to the workspace
 *   - the DB trigger enforces api_keys.bot_id = access_settings.bot_id
 */
export async function createApiKey(
  workspaceId: string,
  userId: string,
  input: CreateApiKeyInput,
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

  // 2. Access settings ownership + bot derivation.
  const accessSettings = await getAccessSettingsById(input.accessSettingsId);
  if (!accessSettings || accessSettings.workspace_id !== workspaceId) {
    throw new Error("ACCESS_SETTINGS_NOT_FOUND");
  }

  // 3. Mint + insert. The DB trigger validates bot_id = access_settings.bot_id.
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = apiKey.slice(0, 11);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      public_id: generatePublicId("key"),
      workspace_id: workspaceId,
      subscription_id: input.subscriptionId,
      access_settings_id: input.accessSettingsId,
      bot_id: accessSettings.bot_id,
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix,
      label: input.label ?? null,
    })
    .select(
      "id, label, api_key_prefix, subscription_id, access_settings_id, bot_id, last_used_at, created_at, revoked_at",
    )
    .single();

  if (error || !data) {
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  // 4. Hydrate response.
  const [{ data: sub }, { data: bot }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("public_id, label, external_user_id")
      .eq("id", data.subscription_id)
      .single(),
    supabase.from("bots").select("name").eq("id", data.bot_id).single(),
  ]);

  return {
    api_key: apiKey,
    record: {
      ...data,
      subscription_public_id: sub?.public_id ?? null,
      subscription_label: sub?.label ?? null,
      subscription_external_user_id: sub?.external_user_id ?? null,
      access_settings_name: accessSettings.name,
      bot_name: bot?.name ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Rotate
// ---------------------------------------------------------------------------

/**
 * Rotate the secret on an existing API key. The row stays in place
 * (same id, same (subscription, access_settings, bot) tuple); only the
 * stored hash + prefix change. Returns the new plaintext key once.
 */
export async function rotateApiKey(
  workspaceId: string,
  userId: string,
  apiKeyId: string,
): Promise<{ api_key: string; record: ApiKeyPublic }> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = apiKey.slice(0, 11);

  const { data, error } = await supabase
    .from("api_keys")
    .update({
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix,
    })
    .eq("id", apiKeyId)
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .select(
      "id, label, api_key_prefix, subscription_id, access_settings_id, bot_id, last_used_at, created_at, revoked_at",
    )
    .maybeSingle();

  if (error) throw new Error(`ROTATE_FAILED: ${error.message}`);
  if (!data) throw new Error("NOT_FOUND");

  const [{ data: sub }, { data: bot }, { data: as_t }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("public_id, label, external_user_id")
      .eq("id", data.subscription_id)
      .single(),
    supabase.from("bots").select("name").eq("id", data.bot_id).single(),
    supabase
      .from("access_settings")
      .select("name")
      .eq("id", data.access_settings_id)
      .single(),
  ]);

  return {
    api_key: apiKey,
    record: {
      ...data,
      subscription_public_id: sub?.public_id ?? null,
      subscription_label: sub?.label ?? null,
      subscription_external_user_id: sub?.external_user_id ?? null,
      access_settings_name: as_t?.name ?? null,
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
  options?: { subscriptionId?: string; accessSettingsId?: string },
): Promise<ApiKeyPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  type ApiKeyRow = {
    id: string;
    label: string | null;
    api_key_prefix: string;
    subscription_id: string;
    access_settings_id: string;
    bot_id: string;
    last_used_at: string | null;
    created_at: string;
    revoked_at: string | null;
    subscriptions: { public_id: string; label: string | null; external_user_id: string | null } | null;
    access_settings: { name: string } | null;
    bots: { name: string } | null;
  };

  const baseQuery = supabase
    .from("api_keys")
    .select(
      "id, label, api_key_prefix, subscription_id, access_settings_id, bot_id, last_used_at, created_at, revoked_at, " +
        "subscriptions(public_id, label, external_user_id), " +
        "access_settings(name), " +
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
  if (options?.accessSettingsId) query = query.eq("access_settings_id", options.accessSettingsId);

  const { data, error } = await query as { data: ApiKeyRow[] | null; error: { message: string } | null };

  if (error) throw new Error(`LIST_FAILED: ${error.message}`);

  return (data ?? []).map((row: ApiKeyRow) => ({
    id: row.id,
    label: row.label,
    api_key_prefix: row.api_key_prefix,
    subscription_id: row.subscription_id,
    subscription_public_id: row.subscriptions?.public_id ?? null,
    subscription_label: row.subscriptions?.label ?? null,
    subscription_external_user_id: row.subscriptions?.external_user_id ?? null,
    access_settings_id: row.access_settings_id,
    access_settings_name: row.access_settings?.name ?? null,
    bot_id: row.bot_id,
    bot_name: row.bots?.name ?? null,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  }));
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

export async function revokeApiKey(
  workspaceId: string,
  userId: string,
  apiKeyId: string,
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
