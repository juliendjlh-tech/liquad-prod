// ---------------------------------------------------------------------------
// Integrations service
//
// Bot-level aggregation for the Integrations page. For every bot active in the
// workspace, returns the bot metadata + counts derived from access_settings
// and api_keys.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { getWorkspaceBots, type BotRecord } from "@/lib/db/queries/agents";

export interface IntegrationListItem {
  bot: BotRecord;
  /** Number of access_settings (plans) for this bot in the workspace. */
  plan_count: number;
  /** Distinct subscriptions with at least one non-revoked api_key on this bot. */
  active_subscriptions_count: number;
  /** Non-revoked api_keys on this bot. */
  active_keys_count: number;
}

export async function listIntegrations(
  workspaceId: string,
): Promise<IntegrationListItem[]> {
  const bots = await getWorkspaceBots(workspaceId);
  if (bots.length === 0) return [];

  const supabase = await createServerClient();
  const botIds = bots.map((b) => b.id);

  const [{ data: plans }, { data: keys }] = await Promise.all([
    supabase
      .from("access_settings")
      .select("bot_id")
      .eq("workspace_id", workspaceId)
      .in("bot_id", botIds),
    supabase
      .from("api_keys")
      .select("bot_id, subscription_id")
      .eq("workspace_id", workspaceId)
      .in("bot_id", botIds)
      .is("revoked_at", null),
  ]);

  const planCount = new Map<string, number>();
  for (const p of plans ?? []) {
    planCount.set(p.bot_id, (planCount.get(p.bot_id) ?? 0) + 1);
  }

  const keyCount = new Map<string, number>();
  const subsByBot = new Map<string, Set<string>>();
  for (const k of keys ?? []) {
    keyCount.set(k.bot_id, (keyCount.get(k.bot_id) ?? 0) + 1);
    const set = subsByBot.get(k.bot_id) ?? new Set<string>();
    set.add(k.subscription_id);
    subsByBot.set(k.bot_id, set);
  }

  return bots.map((bot) => ({
    bot,
    plan_count: planCount.get(bot.id) ?? 0,
    active_subscriptions_count: subsByBot.get(bot.id)?.size ?? 0,
    active_keys_count: keyCount.get(bot.id) ?? 0,
  }));
}

export async function getBotByPublicIdForWorkspace(
  workspaceId: string,
  publicId: string,
): Promise<BotRecord | null> {
  const bots = await getWorkspaceBots(workspaceId);
  return bots.find((b) => b.public_id === publicId) ?? null;
}
