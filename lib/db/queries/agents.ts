// ---------------------------------------------------------------------------
// Agent query module
//
// Centralizes queries for workspace_agents and catalog_agents junction
// tables. Replaces duplicate inline queries across agent, catalog,
// sdk-rules, and rag-query services.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentRecord {
  id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: 'preset' | 'custom';
  description: string | null;
  created_at: string | null;
  /**
   * Aggregate of all wallet balances for this (workspace, agent).
   * Optional: only populated by getWorkspaceAgents(). A single agent can host
   * multiple wallets (see migration 025).
   */
  balance_eur?: number;
  wallet_count?: number;
}

export interface CatalogAgentRecord {
  catalog_id: string;
  agent_id: string;
  agent: {
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
 * Fetch a single agent by ID.
 */
export async function getAgentById(
  agentId: string
): Promise<AgentRecord | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("agents")
    .select("id, name, ua_pattern, declared_ips, type, description, created_at")
    .eq("id", agentId)
    .single();

  if (error) return null;
  return data as AgentRecord;
}

/**
 * Check whether an agent is currently active for a workspace.
 * (row present in workspace_agents junction)
 */
export async function isAgentActiveForWorkspace(
  agentId: string,
  workspaceId: string
): Promise<boolean> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("workspace_agents")
    .select("agent_id")
    .eq("agent_id", agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return !!data;
}

/**
 * Fetch all agents active for a workspace via the workspace_agents junction.
 * balance_eur is the sum of every non-archived wallet the workspace holds on
 * that agent. wallet_count is the number of wallets contributing to that sum.
 */
export async function getWorkspaceAgents(
  workspaceId: string
): Promise<AgentRecord[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("workspace_agents")
    .select("agent_id, agents(id, name, ua_pattern, declared_ips, type, description, created_at)")
    .eq("workspace_id", workspaceId) as unknown as {
      data: Array<{ agent_id: string; agents: AgentRecord }> | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new Error(`Failed to fetch workspace agents: ${error.message}`);
  }

  const rows = data ?? [];
  const agentIds = rows.map((r) => r.agent_id);

  const totals = new Map<string, { balance: number; count: number }>();
  if (agentIds.length > 0) {
    const { data: wallets } = await supabase
      .from("wallets")
      .select("agent_id, balance_eur")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .in("agent_id", agentIds);

    for (const w of wallets ?? []) {
      const prev = totals.get(w.agent_id) ?? { balance: 0, count: 0 };
      prev.balance += Number(w.balance_eur);
      prev.count += 1;
      totals.set(w.agent_id, prev);
    }
  }

  return rows.map((row) => {
    const t = totals.get(row.agent_id) ?? { balance: 0, count: 0 };
    return {
      ...row.agents,
      balance_eur: t.balance,
      wallet_count: t.count,
    };
  });
}

/**
 * Fetch all catalog_agents links for a set of catalog IDs,
 * joining agent details in a single query.
 *
 * Returns one row per catalog–agent link with the full agent record.
 */
export async function getCatalogAgents(
  catalogIds: string[]
): Promise<CatalogAgentRecord[]> {
  if (catalogIds.length === 0) return [];

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("catalog_agents")
    .select("catalog_id, agent_id, agents(id, name, ua_pattern, declared_ips, type, description)")
    .in("catalog_id", catalogIds);

  if (error) {
    throw new Error(`Failed to fetch catalog agents: ${error.message}`);
  }

  return (data ?? []).map(
    (row: { catalog_id: string; agent_id: string; agents: CatalogAgentRecord["agent"] }) => ({
      catalog_id: row.catalog_id,
      agent_id: row.agent_id,
      agent: row.agents,
    })
  );
}
