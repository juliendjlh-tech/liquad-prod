// ---------------------------------------------------------------------------
// Bot query module
//
// Centralizes queries for workspace_bots and catalog_bots junction tables.
// Subscriptions are workspace-scoped (since migration 032), so bot rows no
// longer carry an aggregated balance — see /dashboard/subscriptions for the
// financial view.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BotRecord {
  id: string;
  public_id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: 'preset' | 'custom';
  description: string | null;
  created_at: string | null;
}

export interface CatalogBotRecord {
  catalog_id: string;
  bot_id: string;
  bot: {
    id: string;
    public_id: string;
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

export async function getBotById(botId: string): Promise<BotRecord | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("bots")
    .select("id, public_id, name, ua_pattern, declared_ips, type, description, created_at")
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
 */
export async function getWorkspaceBots(
  workspaceId: string
): Promise<BotRecord[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("workspace_bots")
    .select("bot_id, bots(id, public_id, name, ua_pattern, declared_ips, type, description, created_at)")
    .eq("workspace_id", workspaceId) as unknown as {
      data: Array<{ bot_id: string; bots: BotRecord }> | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new Error(`Failed to fetch workspace bots: ${error.message}`);
  }

  return (data ?? []).map((row) => row.bots);
}

/**
 * Fetch all catalog_bots links for a set of catalog IDs,
 * joining bot details in a single query.
 */
export async function getCatalogBots(
  catalogIds: string[]
): Promise<CatalogBotRecord[]> {
  if (catalogIds.length === 0) return [];

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("catalog_bots")
    .select("catalog_id, bot_id, bots(id, public_id, name, ua_pattern, declared_ips, type, description)")
    .in("catalog_id", catalogIds) as unknown as {
      data: Array<{ catalog_id: string; bot_id: string; bots: CatalogBotRecord["bot"] }> | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new Error(`Failed to fetch catalog bots: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    catalog_id: row.catalog_id,
    bot_id: row.bot_id,
    bot: row.bots,
  }));
}
