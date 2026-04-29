// ---------------------------------------------------------------------------
// Bot query module
//
// Centralizes queries for workspace_bots and catalog_bots junction
// tables. Replaces duplicate inline queries across bot, catalog,
// sdk-rules, and rag-query services.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BotRecord {
  id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: 'preset' | 'custom';
  description: string | null;
  created_at: string | null;
  /**
   * Aggregate of all bot subscription balances for this (workspace, bot).
   * Optional: only populated by getWorkspaceBots(). A single bot can host
   * multiple bot subscriptions (see migration 025).
   */
  balance_eur?: number;
  bot_subscription_count?: number;
  /**
   * Per-(workspace, bot) flag from workspace_bots.scope_to_workspace.
   * Optional: only populated by getWorkspaceBots() and getBotById() when
   * a workspace context is available. See migration 030.
   */
  scope_to_workspace?: boolean;
}

export interface CatalogBotRecord {
  catalog_id: string;
  bot_id: string;
  bot: {
    id: string;
    name: string;
    ua_pattern: string;
    declared_ips: string[];
    type: 'preset' | 'custom';
    description: string | null;
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch a single bot by ID.
 */
export async function getBotById(
  botId: string
): Promise<BotRecord | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("bots")
    .select("id, name, ua_pattern, declared_ips, type, description, created_at")
    .eq("id", botId)
    .single();

  if (error) return null;
  return data as BotRecord;
}

/**
 * Check whether a bot is currently active for a workspace.
 * (row present in workspace_bots junction)
 */
export async function isBotActiveForWorkspace(
  botId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("workspace_bots")
    .select("bot_id")
    .eq("bot_id", botId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return !!data;
}

/**
 * Fetch all bots active for a workspace via the workspace_bots junction.
 * balance_eur is the sum of every non-archived bot subscription the workspace holds on
 * that bot. bot_subscription_count is the number of bot subscriptions contributing to that sum.
 */
export async function getWorkspaceBots(
  workspaceId: string
): Promise<BotRecord[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("workspace_bots")
    .select("bot_id, scope_to_workspace, bots(id, name, ua_pattern, declared_ips, type, description, created_at)")
    .eq("workspace_id", workspaceId) as unknown as {
      data: Array<{ bot_id: string; scope_to_workspace: boolean; bots: BotRecord }> | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new Error(`Failed to fetch workspace bots: ${error.message}`);
  }

  const rows = data ?? [];
  const botIds = rows.map((r) => r.bot_id);

  const totals = new Map<string, { balance: number; count: number }>();
  if (botIds.length > 0) {
    const { data: botSubscriptions } = await supabase
      .from("bot_subscriptions")
      .select("bot_id, balance_eur")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .in("bot_id", botIds);

    for (const w of botSubscriptions ?? []) {
      const prev = totals.get(w.bot_id) ?? { balance: 0, count: 0 };
      prev.balance += Number(w.balance_eur);
      prev.count += 1;
      totals.set(w.bot_id, prev);
    }
  }

  return rows.map((row) => {
    const t = totals.get(row.bot_id) ?? { balance: 0, count: 0 };
    return {
      ...row.bots,
      balance_eur: t.balance,
      bot_subscription_count: t.count,
      scope_to_workspace: row.scope_to_workspace,
    };
  });
}

/**
 * Fetch all catalog_bots links for a set of catalog IDs,
 * joining bot details in a single query.
 *
 * Returns one row per catalog–bot link with the full bot record.
 */
export async function getCatalogBots(
  catalogIds: string[]
): Promise<CatalogBotRecord[]> {
  if (catalogIds.length === 0) return [];

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("catalog_bots")
    .select("catalog_id, bot_id, bots(id, name, ua_pattern, declared_ips, type, description)")
    .in("catalog_id", catalogIds);

  if (error) {
    throw new Error(`Failed to fetch catalog bots: ${error.message}`);
  }

  return (data ?? []).map(
    (row: { catalog_id: string; bot_id: string; bots: CatalogBotRecord["bot"] }) => ({
      catalog_id: row.catalog_id,
      bot_id: row.bot_id,
      bot: row.bots,
    })
  );
}
