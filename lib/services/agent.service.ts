import { createServerClient } from "@/lib/db/supabase-server";
import { getWorkspaceAgents as queryWorkspaceAgents } from "@/lib/db/queries/agents";

// ---------------------------------------------------------------------------
// AI Bot Presets
// ---------------------------------------------------------------------------
// Each preset represents a well-known AI bot. These are seeded into the
// global agents table by migration 018. The list here is used by the
// "presets" API endpoint to show which bots are available for subscription.

export const AI_BOT_PRESETS: Array<{
  name: string;
  ua_pattern: string;
  operator: string;
  description?: string;
}> = [
  // --- OpenAI bots ---
  {
    name: "GPTBot",
    ua_pattern: "GPTBot",
    operator: "OpenAI",
    description:
      "Used by OpenAI to crawl web content that may be used to improve future AI models.",
  },
  {
    name: "OAI-SearchBot",
    ua_pattern: "OAI-SearchBot",
    operator: "OpenAI",
    description:
      "Used by OpenAI search features to discover and index publicly available web content.",
  },
  {
    name: "ChatGPT-User",
    ua_pattern: "ChatGPT-User",
    operator: "OpenAI",
    description:
      "Used when ChatGPT visits a URL on behalf of a user action, such as browsing or retrieval.",
  },
  {
    name: "OAI-SearchAgent",
    ua_pattern: "OAI-SearchAgent",
    operator: "OpenAI",
    description:
      "Used by OpenAI agents to fetch and process web pages in response to user requests.",
  },

  // --- Anthropic ---
  {
    name: "ClaudeBot",
    ua_pattern: "ClaudeBot",
    operator: "Anthropic",
    description:
      "Used by Anthropic to crawl web content for Claude-related indexing and model quality workflows.",
  },
  {
    name: "Claude-SearchBot",
    ua_pattern: "Claude-SearchBot",
    operator: "Anthropic",
    description:
      "Used for Claude web search discovery and retrieval of relevant public pages.",
  },
  {
    name: "Claude-User",
    ua_pattern: "Claude-User",
    operator: "Anthropic",
    description:
      "Used when Claude accesses a URL as part of an explicit user-initiated action.",
  },
  {
    name: "anthropic-ai",
    ua_pattern: "anthropic-ai",
    operator: "Anthropic",
    description:
      "General Anthropic AI crawler identity used for service-level automated retrieval tasks.",
  },

  // --- Google ---
  {
    name: "Googlebot",
    ua_pattern: "Googlebot",
    operator: "Google",
    description:
      "Google's main crawler used for Search indexing and serving search results.",
  },
  {
    name: "Google-Extended",
    ua_pattern: "Google-Extended",
    operator: "Google",
    description:
      "Google product token publishers can use to manage whether site content is used for Gemini and Vertex AI generative features.",
  },
  {
    name: "GoogleOther",
    ua_pattern: "GoogleOther",
    operator: "Google",
    description:
      "General-purpose Google crawler used for product improvements, research, and quality checks outside core Search crawling.",
  },
  {
    name: "Gemini-Deep-Research",
    ua_pattern: "Gemini-Deep-Research",
    operator: "Google",
    description:
      "Used by Gemini deep research features to retrieve and analyze web content for user queries.",
  },
  {
    name: "Google-CloudVertexBot",
    ua_pattern: "Google-CloudVertexBot",
    operator: "Google",
    description:
      "Used by Google Cloud Vertex AI services to access web resources for configured enterprise AI workflows.",
  },

  // --- Microsoft ---
  {
    name: "bingbot",
    ua_pattern: "bingbot",
    operator: "Microsoft",
    description:
      "Microsoft Bing's primary crawler used to index web pages for Bing Search.",
  },
  {
    name: "BingPreview",
    ua_pattern: "BingPreview",
    operator: "Microsoft",
    description:
      "Used by Bing to fetch page previews, snapshots, and rendering data for search experiences.",
  },
  {
    name: "AdIdxBot",
    ua_pattern: "AdIdxBot",
    operator: "Microsoft",
    description:
      "Microsoft advertising crawler used to review landing pages and ad quality signals.",
  },

  // --- Perplexity ---
  {
    name: "PerplexityBot",
    ua_pattern: "PerplexityBot",
    operator: "Perplexity",
    description:
      "Perplexity crawler used to discover and index public web content for answer generation.",
  },
  {
    name: "Perplexity-User",
    ua_pattern: "Perplexity-User",
    operator: "Perplexity",
    description:
      "Used when Perplexity accesses a page in direct response to a user request.",
  },
  {
    name: "Perplexity-Search",
    ua_pattern: "Perplexity-Search",
    operator: "Perplexity",
    description:
      "Used by Perplexity web search systems to retrieve sources for real-time answers.",
  },

  // --- Amazon ---
  {
    name: "Amazonbot",
    ua_pattern: "Amazonbot",
    operator: "Amazon",
    description:
      "Amazon crawler used to process web content for Amazon search and AI-powered services.",
  },

  // --- Apple ---
  {
    name: "Applebot",
    ua_pattern: "Applebot",
    operator: "Apple",
    description:
      "Apple's web crawler used by Siri and Spotlight suggestions and search-related features.",
  },
  {
    name: "Applebot-Extended",
    ua_pattern: "Applebot-Extended",
    operator: "Apple",
    description:
      "Extended Apple crawler token for additional Apple Intelligence and generative feature usage controls.",
  },

  // --- Meta ---
  {
    name: "Meta-ExternalAgent",
    ua_pattern: "meta-externalagent",
    operator: "Meta",
    description:
      "Meta external retrieval agent used to access public web content for AI and assistant features.",
  },

  // --- Mistral ---
  {
    name: "MistralAI-User",
    ua_pattern: "MistralAI-User",
    operator: "Mistral AI",
    description:
      "Used when Mistral AI services access URLs on behalf of explicit user requests.",
  },
  {
    name: "MistralAI-SearchBot",
    ua_pattern: "MistralAI-SearchBot",
    operator: "Mistral AI",
    description:
      "Mistral AI crawler used for web search, retrieval, and source discovery.",
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentRow {
  id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// CRUD Functions
// ---------------------------------------------------------------------------

const AGENT_SELECT_COLUMNS = "id, name, ua_pattern, declared_ips, created_at";

/**
 * List all agents active for a workspace (via workspace_agents junction).
 */
export async function getWorkspaceAgents(
  workspaceId: string
): Promise<AgentRow[]> {
  return queryWorkspaceAgents(workspaceId) as Promise<AgentRow[]>;
}

/**
 * Get a single agent by ID.
 */
export async function getAgentById(
  agentId: string
): Promise<AgentRow | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("agents")
    .select(AGENT_SELECT_COLUMNS)
    .eq("id", agentId)
    .single();

  if (error || !data) return null;
  return data as AgentRow;
}

/**
 * Add an agent to a workspace (subscribe).
 * If the agent doesn't exist yet (custom), create it first.
 */
export async function addAgentToWorkspace(
  workspaceId: string,
  data: { name: string; ua_pattern: string; declared_ips?: string[] }
): Promise<AgentRow> {
  const supabase = await createServerClient();

  // Check if agent already exists globally
  let { data: agent } = await supabase
    .from("agents")
    .select(AGENT_SELECT_COLUMNS)
    .eq("name", data.name)
    .single();

  if (!agent) {
    // Create custom agent
    const { data: created, error } = await supabase
      .from("agents")
      .insert({
        name: data.name,
        ua_pattern: data.ua_pattern,
        declared_ips: data.declared_ips ?? [],
      })
      .select(AGENT_SELECT_COLUMNS)
      .single();

    if (error || !created) {
      throw new Error(`Failed to create agent: ${error?.message}`);
    }
    agent = created;
  }

  // Link to workspace
  const { error: linkError } = await supabase
    .from("workspace_agents")
    .insert({ workspace_id: workspaceId, agent_id: agent.id })
    .select()
    .single();

  if (linkError) {
    // Ignore duplicate (already linked)
    if (!linkError.message.includes("duplicate")) {
      throw new Error(`Failed to link agent to workspace: ${linkError.message}`);
    }
  }

  return agent as AgentRow;
}

/**
 * Remove an agent from a workspace (unsubscribe).
 * Does NOT delete the global agent record.
 */
export async function removeAgentFromWorkspace(
  workspaceId: string,
  agentId: string
): Promise<{ removed: boolean; catalogCount: number }> {
  const supabase = await createServerClient();

  // Check the link exists
  const { data: link } = await supabase
    .from("workspace_agents")
    .select("agent_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .single();

  if (!link) {
    return { removed: false, catalogCount: 0 };
  }

  // Count linked catalogs before removal
  const { count } = await supabase
    .from("catalog_agents")
    .select("catalog_id", { count: "exact", head: true })
    .eq("agent_id", agentId);

  const catalogCount = count ?? 0;

  // Remove catalog links for this agent in this workspace's catalogs
  if (catalogCount > 0) {
    const { data: workspaceCatalogs } = await supabase
      .from("catalogs")
      .select("id")
      .eq("workspace_id", workspaceId);

    const catalogIds = (workspaceCatalogs ?? []).map((c: { id: string }) => c.id);
    if (catalogIds.length > 0) {
      await supabase
        .from("catalog_agents")
        .delete()
        .eq("agent_id", agentId)
        .in("catalog_id", catalogIds);
    }
  }

  // Remove workspace_agents link
  const { error } = await supabase
    .from("workspace_agents")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId);

  if (error) {
    throw new Error(`Failed to remove agent from workspace: ${error.message}`);
  }

  return { removed: true, catalogCount };
}

/**
 * Update an agent's properties (name, ua_pattern, declared_ips).
 */
export async function updateAgent(
  agentId: string,
  data: { name?: string; ua_pattern?: string; declared_ips?: string[] }
): Promise<AgentRow | null> {
  const supabase = await createServerClient();

  const { data: updated, error } = await supabase
    .from("agents")
    .update(data)
    .eq("id", agentId)
    .select(AGENT_SELECT_COLUMNS)
    .single();

  if (error || !updated) return null;
  return updated as AgentRow;
}

/**
 * Remove all catalog_agents entries for a given agent.
 */
export async function removeCatalogEntriesForAgent(
  agentId: string
): Promise<number> {
  const supabase = await createServerClient();

  const { count } = await supabase
    .from("catalog_agents")
    .select("catalog_id", { count: "exact", head: true })
    .eq("agent_id", agentId);

  const catalogCount = count ?? 0;
  if (catalogCount === 0) return 0;

  const { error } = await supabase
    .from("catalog_agents")
    .delete()
    .eq("agent_id", agentId);

  if (error) {
    throw new Error(`Failed to remove catalog entries: ${error.message}`);
  }

  return catalogCount;
}
