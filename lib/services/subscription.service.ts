// ---------------------------------------------------------------------------
// Subscription service
//
// A subscription is a spending policy: a named group of api_keys with an
// optional monthly_cap_eur ceiling. The wallet itself lives on the workspace
// (workspaces.balance_eur, topped up by Stripe or admin) — subscriptions no
// longer hold balance since migration 047.
//
// Access scope, catalogue allowlists and per-grant price caps still live on
// the API key's access_settings (migration 045).
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generatePublicId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateSubscriptionInput {
  externalUserId?: string | null;
  label?: string | null;
  monthlyCapEur?: number | null;
}

export interface UpdateSubscriptionInput {
  label?: string | null;
  externalUserId?: string | null;
  monthlyCapEur?: number | null;
}

export interface SubscriptionPublic {
  id: string;
  public_id: string;
  workspace_id: string;
  external_user_id: string | null;
  label: string | null;
  monthly_cap_eur: number | null;
  current_month_spent_eur: number;
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

function toPublic(
  row: {
    id: string;
    public_id: string;
    workspace_id: string;
    external_user_id: string | null;
    label: string | null;
    monthly_cap_eur: number | string | null;
    created_at: string | null;
    archived_at: string | null;
  },
  activeKeys: number,
  currentMonthSpentEur: number
): SubscriptionPublic {
  return {
    id: row.id,
    public_id: row.public_id,
    workspace_id: row.workspace_id,
    external_user_id: row.external_user_id,
    label: row.label,
    monthly_cap_eur: row.monthly_cap_eur === null ? null : Number(row.monthly_cap_eur),
    current_month_spent_eur: currentMonthSpentEur,
    active_keys: activeKeys,
    created_at: row.created_at,
    archived_at: row.archived_at,
  };
}

// Calendar-month spent (UTC) computed from credit_transactions debit rows.
// Mirrors the SUM used inside authorize_and_debit_batch so the dashboard
// figure matches the RPC's enforcement boundary exactly.
async function computeCurrentMonthSpent(
  subscriptionIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (subscriptionIds.length === 0) return result;

  const supabase = await createServerClient();
  const periodStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 0, 0, 0)
  ).toISOString();

  const { data: debits } = await supabase
    .from("credit_transactions")
    .select("subscription_id, amount_eur")
    .in("subscription_id", subscriptionIds)
    .eq("role", "debit")
    .gte("created_at", periodStart);

  for (const d of debits ?? []) {
    const id = d.subscription_id as string;
    const spent = (result.get(id) ?? 0) + Math.abs(Number(d.amount_eur));
    result.set(id, spent);
  }
  return result;
}

function normalizeCap(input: number | null | undefined): number | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (!Number.isFinite(input) || input < 0) throw new Error("INVALID_MONTHLY_CAP");
  return input;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createSubscription(
  workspaceId: string,
  userId: string,
  input: CreateSubscriptionInput
): Promise<SubscriptionPublic> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const cap = normalizeCap(input.monthlyCapEur);

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      public_id: generatePublicId("sub"),
      workspace_id: workspaceId,
      external_user_id: input.externalUserId ?? null,
      label: input.label ?? null,
      monthly_cap_eur: cap ?? null,
    })
    .select(
      "id, public_id, workspace_id, external_user_id, label, monthly_cap_eur, created_at, archived_at"
    )
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new Error("SUBSCRIPTION_DUPLICATE");
    }
    throw new Error(`CREATE_FAILED: ${error?.message ?? "unknown"}`);
  }

  return toPublic(data, 0, 0);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listSubscriptions(
  workspaceId: string,
  userId: string,
  options?: { publicIdPrefix?: string; limit?: number }
): Promise<SubscriptionPublic[]> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();

  let query = supabase
    .from("subscriptions")
    .select(
      "id, public_id, workspace_id, external_user_id, label, monthly_cap_eur, created_at, archived_at"
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (options?.publicIdPrefix) {
    // Anchor the LIKE pattern to the start; escape % and _ in the user input.
    const escaped = options.publicIdPrefix
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    query = query.ilike("public_id", `${escaped}%`);
  }
  if (options?.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data: subscriptions, error } = await query;

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

  const spentBySub = await computeCurrentMonthSpent(subscriptionIds);

  return rows.map((row) =>
    toPublic(row, keyCounts.get(row.id) ?? 0, spentBySub.get(row.id) ?? 0)
  );
}

// ---------------------------------------------------------------------------
// Lookup by public_id
// ---------------------------------------------------------------------------

export async function getSubscriptionByPublicId(
  workspaceId: string,
  userId: string,
  publicId: string
): Promise<SubscriptionPublic | null> {
  await assertRole(workspaceId, userId, ["owner", "admin", "member"]);

  const supabase = await createServerClient();
  const { data: row } = await supabase
    .from("subscriptions")
    .select(
      "id, public_id, workspace_id, external_user_id, label, monthly_cap_eur, created_at, archived_at"
    )
    .eq("workspace_id", workspaceId)
    .eq("public_id", publicId)
    .maybeSingle();

  if (!row) return null;

  const { data: keys } = await supabase
    .from("api_keys")
    .select("id")
    .eq("subscription_id", row.id)
    .is("revoked_at", null);

  const spent = await computeCurrentMonthSpent([row.id]);
  return toPublic(row, keys?.length ?? 0, spent.get(row.id) ?? 0);
}

// ---------------------------------------------------------------------------
// Update (label / external_user_id / monthly cap)
// ---------------------------------------------------------------------------

export async function updateSubscription(
  workspaceId: string,
  userId: string,
  subscriptionId: string,
  input: UpdateSubscriptionInput
): Promise<SubscriptionPublic> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const cap = normalizeCap(input.monthlyCapEur);

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
  if (cap !== undefined) update.monthly_cap_eur = cap;

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

// The wallet lives on the workspace now, so archiving a subscription never
// strands funds. All non-revoked keys are revoked atomically with the archive.
export async function archiveSubscription(
  workspaceId: string,
  userId: string,
  subscriptionId: string
): Promise<void> {
  await assertRole(workspaceId, userId, ["owner", "admin"]);

  const supabase = await createServerClient();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("id", subscriptionId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();

  if (!subscription) throw new Error("NOT_FOUND");

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
