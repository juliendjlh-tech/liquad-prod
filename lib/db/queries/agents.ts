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
  created_at: string | null;
}

export interface CatalogAgentRecord {
  catalog_id: string;
  agent_id: string;
  agent: {
    id: string;
    name: string;
    ua_pattern: string;
    declared_ips: string[];
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
    .select("id, name, ua_pattern, declared_ips, created_at")
    .eq("id", agentId)
    .single();

  if (error) return null;
  return data as AgentRecord;
}

/**
 * Fetch all agents active for a workspace via the workspace_agents junction.
 */
export async function getWorkspaceAgents(
  workspaceId: string
): Promise<AgentRecord[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("workspace_agents")
    .select("agents(id, name, ua_pattern, declared_ips, created_at)")
    .eq("workspace_id", workspaceId) as unknown as {
      data: Array<{ agents: AgentRecord }> | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new Error(`Failed to fetch workspace agents: ${error.message}`);
  }

  return (data ?? []).map((row) => row.agents);
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
    .select("catalog_id, agent_id, agents(id, name, ua_pattern, declared_ips)")
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
