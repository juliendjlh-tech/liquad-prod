import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// AI Bot Presets (PRD Appendix A + Identity Check extension)
// ---------------------------------------------------------------------------
// Each preset represents a well-known AI bot with its:
//   - name: Human-readable identifier (shown in dashboard)
//   - ua_pattern: Substring to match in the User-Agent header (case-insensitive)
//   - operator: Company that operates this bot
//   - dns_patterns: DNS hostname globs for Identity Check verification
//
// dns_patterns are used by the SDK's Identity Check module to verify that
// a bot's IP address actually belongs to the claimed operator via rDNS/fDNS.
// Example: GPTBot should resolve to *.openai.com. If it doesn't, it's spoofed.
//
// Sources for DNS patterns:
//   - Google: https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot
//   - Bing: https://www.bing.com/webmasters/help/how-to-verify-bingbot-3905dc26
//   - OpenAI: https://platform.openai.com/docs/bots
//   - Each operator's official documentation

export const AI_BOT_PRESETS: Array<{
  name: string;
  ua_pattern: string;
  operator: string;
  dns_patterns: string[];
  description?: string;
}> = [
  // --- OpenAI bots ---
  {
    name: "GPTBot",
    ua_pattern: "GPTBot",
    operator: "OpenAI",
    dns_patterns: ["*.openai.com"],
    description:
      "Used by OpenAI to crawl web content that may be used to improve future AI models.",
  },
  {
    name: "OAI-SearchBot",
    ua_pattern: "OAI-SearchBot",
    operator: "OpenAI",
    dns_patterns: ["*.openai.com"],
    description:
      "Used by OpenAI search features to discover and index publicly available web content.",
  },
  {
    name: "ChatGPT-User",
    ua_pattern: "ChatGPT-User",
    operator: "OpenAI",
    dns_patterns: ["*.openai.com"],
    description:
      "Used when ChatGPT visits a URL on behalf of a user action, such as browsing or retrieval.",
  },
  {
    name: "OAI-SearchAgent",
    ua_pattern: "OAI-SearchAgent",
    operator: "OpenAI",
    dns_patterns: ["*.openai.com"],
    description:
      "Used by OpenAI agents to fetch and process web pages in response to user requests.",
  },

  // --- Anthropic ---
  {
    name: "ClaudeBot",
    ua_pattern: "ClaudeBot",
    operator: "Anthropic",
    dns_patterns: ["*.anthropic.com"],
    description:
      "Used by Anthropic to crawl web content for Claude-related indexing and model quality workflows.",
  },
  {
    name: "Claude-SearchBot",
    ua_pattern: "Claude-SearchBot",
    operator: "Anthropic",
    dns_patterns: ["*.anthropic.com"],
    description:
      "Used for Claude web search discovery and retrieval of relevant public pages.",
  },
  {
    name: "Claude-User",
    ua_pattern: "Claude-User",
    operator: "Anthropic",
    dns_patterns: ["*.anthropic.com"],
    description:
      "Used when Claude accesses a URL as part of an explicit user-initiated action.",
  },
  {
    name: "anthropic-ai",
    ua_pattern: "anthropic-ai",
    operator: "Anthropic",
    dns_patterns: ["*.anthropic.com"],
    description:
      "General Anthropic AI crawler identity used for service-level automated retrieval tasks.",
  },

  // --- Google ---
  {
    name: "Googlebot",
    ua_pattern: "Googlebot",
    operator: "Google",
    dns_patterns: ["*.googlebot.com", "*.google.com"],
    description:
      "Google's main crawler used for Search indexing and serving search results.",
  },
  {
    name: "Google-Extended",
    ua_pattern: "Google-Extended",
    operator: "Google",
    dns_patterns: ["*.googlebot.com", "*.google.com"],
    description:
      "Google product token publishers can use to manage whether site content is used for Gemini and Vertex AI generative features.",
  },
  {
    name: "GoogleOther",
    ua_pattern: "GoogleOther",
    operator: "Google",
    dns_patterns: ["*.googlebot.com", "*.google.com"],
    description:
      "General-purpose Google crawler used for product improvements, research, and quality checks outside core Search crawling.",
  },
  {
    name: "Gemini-Deep-Research",
    ua_pattern: "Gemini-Deep-Research",
    operator: "Google",
    dns_patterns: ["*.googlebot.com", "*.google.com"],
    description:
      "Used by Gemini deep research features to retrieve and analyze web content for user queries.",
  },
  {
    name: "Google-CloudVertexBot",
    ua_pattern: "Google-CloudVertexBot",
    operator: "Google",
    dns_patterns: ["*.googlebot.com", "*.google.com"],
    description:
      "Used by Google Cloud Vertex AI services to access web resources for configured enterprise AI workflows.",
  },

  // --- Microsoft ---
  {
    name: "bingbot",
    ua_pattern: "bingbot",
    operator: "Microsoft",
    dns_patterns: ["*.search.msn.com"],
    description:
      "Microsoft Bing's primary crawler used to index web pages for Bing Search.",
  },
  {
    name: "BingPreview",
    ua_pattern: "BingPreview",
    operator: "Microsoft",
    dns_patterns: ["*.search.msn.com"],
    description:
      "Used by Bing to fetch page previews, snapshots, and rendering data for search experiences.",
  },
  {
    name: "AdIdxBot",
    ua_pattern: "AdIdxBot",
    operator: "Microsoft",
    dns_patterns: ["*.search.msn.com"],
    description:
      "Microsoft advertising crawler used to review landing pages and ad quality signals.",
  },

  // --- Perplexity ---
  {
    name: "PerplexityBot",
    ua_pattern: "PerplexityBot",
    operator: "Perplexity",
    dns_patterns: ["*.perplexity.ai"],
    description:
      "Perplexity crawler used to discover and index public web content for answer generation.",
  },
  {
    name: "Perplexity-User",
    ua_pattern: "Perplexity-User",
    operator: "Perplexity",
    dns_patterns: ["*.perplexity.ai"],
    description:
      "Used when Perplexity accesses a page in direct response to a user request.",
  },
  {
    name: "Perplexity-Search",
    ua_pattern: "Perplexity-Search",
    operator: "Perplexity",
    dns_patterns: ["*.perplexity.ai"],
    description:
      "Used by Perplexity web search systems to retrieve sources for real-time answers.",
  },

  // --- Amazon ---
  {
    name: "Amazonbot",
    ua_pattern: "Amazonbot",
    operator: "Amazon",
    dns_patterns: ["*.amazonaws.com"],
    description:
      "Amazon crawler used to process web content for Amazon search and AI-powered services.",
  },

  // --- Apple ---
  {
    name: "Applebot",
    ua_pattern: "Applebot",
    operator: "Apple",
    dns_patterns: ["*.applebot.apple.com"],
    description:
      "Apple's web crawler used by Siri and Spotlight suggestions and search-related features.",
  },
  {
    name: "Applebot-Extended",
    ua_pattern: "Applebot-Extended",
    operator: "Apple",
    dns_patterns: ["*.applebot.apple.com"],
    description:
      "Extended Apple crawler token for additional Apple Intelligence and generative feature usage controls.",
  },

  // --- Meta ---
  {
    name: "Meta-ExternalAgent",
    ua_pattern: "meta-externalagent",
    operator: "Meta",
    dns_patterns: ["*.facebook.com", "*.meta.com"],
    description:
      "Meta external retrieval agent used to access public web content for AI and assistant features.",
  },

  // --- Mistral ---
  {
    name: "MistralAI-User",
    ua_pattern: "MistralAI-User",
    operator: "Mistral AI",
    dns_patterns: ["*.mistral.ai"],
    description:
      "Used when Mistral AI services access URLs on behalf of explicit user requests.",
  },
  {
    name: "MistralAI-SearchBot",
    ua_pattern: "MistralAI-SearchBot",
    operator: "Mistral AI",
    dns_patterns: ["*.mistral.ai"],
    description:
      "Mistral AI crawler used for web search, retrieval, and source discovery.",
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of a user_agents row as returned by Supabase queries.
 *
 * Represents a single bot declaration within a workspace. Each workspace
 * maintains its own set of user-agents (bots) that the SDK uses for
 * matching incoming requests and applying licensing rules.
 */
export interface UserAgentRow {
  id: string;
  workspace_id: string;
  name: string;
  ua_pattern: string;
  is_active: boolean;
  is_preset: boolean;
  created_at: string;

  /**
   * DNS hostname glob patterns for Identity Check verification.
   *
   * Example: ["*.openai.com"] means the bot's IP must resolve to
   * a hostname ending in .openai.com via reverse DNS.
   *
   * Empty array means Identity Check is skipped for this bot.
   *
   * @see packages/sdk/src/identity-check.ts for the verification logic
   */
  dns_patterns: string[];
}

// ---------------------------------------------------------------------------
// CRUD Functions
// ---------------------------------------------------------------------------

/**
 * The select columns used in all user-agent queries.
 * Centralized here to ensure dns_patterns is always included.
 */
const USER_AGENT_SELECT_COLUMNS =
  "id, workspace_id, name, ua_pattern, is_active, is_preset, dns_patterns, created_at";

/**
 * Create a new user-agent for a workspace.
 *
 * Checks for duplicate name per workspace before insert.
 * Accepts an optional `dns_patterns` array for Identity Check support.
 *
 * @param workspaceId - The workspace to create the bot in
 * @param data - Bot data including name, ua_pattern, and optional dns_patterns
 * @returns The created user-agent record
 * @throws Error with "DUPLICATE_NAME" if name already exists in workspace
 */
export async function createUserAgent(
  workspaceId: string,
  data: {
    name: string;
    ua_pattern: string;
    is_preset?: boolean;
    dns_patterns?: string[];
  }
): Promise<UserAgentRow> {
  const supabase = await createServerClient();

  // Check for duplicate name in the same workspace
  const { data: existing } = await supabase
    .from("user_agents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", data.name)
    .single();

  if (existing) {
    throw new Error("DUPLICATE_NAME");
  }

  const { data: created, error } = await supabase
    .from("user_agents")
    .insert({
      workspace_id: workspaceId,
      name: data.name,
      ua_pattern: data.ua_pattern,
      is_preset: data.is_preset ?? false,
      is_active: true,
      dns_patterns: data.dns_patterns ?? [],
    })
    .select(USER_AGENT_SELECT_COLUMNS)
    .single();

  if (error || !created) {
    throw new Error(`Failed to create user-agent: ${error?.message}`);
  }

  return created as UserAgentRow;
}

/**
 * List all user-agents for a workspace.
 *
 * Returns all bots declared in this workspace, ordered by creation date.
 * Each bot includes its dns_patterns for Identity Check support.
 *
 * @param workspaceId - The workspace to list bots from
 * @returns Array of user-agent records (includes dns_patterns)
 */
export async function getUserAgents(
  workspaceId: string
): Promise<UserAgentRow[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_agents")
    .select(USER_AGENT_SELECT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list user-agents: ${error.message}`);
  }

  return (data ?? []) as UserAgentRow[];
}

/**
 * Get a single user-agent by ID, scoped to workspace.
 *
 * @param userAgentId - The bot's UUID
 * @param workspaceId - The workspace the bot must belong to
 * @returns User-agent record (with dns_patterns) or null if not found/wrong workspace
 */
export async function getUserAgentById(
  userAgentId: string,
  workspaceId: string
): Promise<UserAgentRow | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_agents")
    .select(USER_AGENT_SELECT_COLUMNS)
    .eq("id", userAgentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as UserAgentRow;
}

/**
 * Update a user-agent (partial update).
 *
 * Supports updating name, ua_pattern, is_active, and dns_patterns fields.
 * Only provided fields are updated — omitted fields remain unchanged.
 *
 * @param userAgentId - The bot's UUID
 * @param workspaceId - The workspace the bot must belong to
 * @param data - Partial update payload (any combination of updatable fields)
 * @returns Updated record (with dns_patterns) or null if not found/wrong workspace
 */
export async function updateUserAgent(
  userAgentId: string,
  workspaceId: string,
  data: {
    name?: string;
    ua_pattern?: string;
    is_active?: boolean;
    dns_patterns?: string[];
  }
): Promise<UserAgentRow | null> {
  const supabase = await createServerClient();

  // First check it exists and belongs to workspace
  const existing = await getUserAgentById(userAgentId, workspaceId);
  if (!existing) {
    return null;
  }

  const { data: updated, error } = await supabase
    .from("user_agents")
    .update(data)
    .eq("id", userAgentId)
    .eq("workspace_id", workspaceId)
    .select(USER_AGENT_SELECT_COLUMNS)
    .single();

  if (error || !updated) {
    throw new Error(`Failed to update user-agent: ${error?.message}`);
  }

  return updated as UserAgentRow;
}

/**
 * Remove all catalog_agents entries for a given user-agent without deleting the agent.
 * Used when toggling a bot off — the agent stays in user_agents but its catalog links are severed.
 *
 * @returns number of catalog entries removed
 */
export async function removeCatalogEntriesForAgent(
  userAgentId: string
): Promise<number> {
  const supabase = await createServerClient();

  const { count } = await supabase
    .from("catalog_agents")
    .select("catalog_id", { count: "exact", head: true })
    .eq("user_agent_id", userAgentId);

  const catalogCount = count ?? 0;
  if (catalogCount === 0) return 0;

  const { error } = await supabase
    .from("catalog_agents")
    .delete()
    .eq("user_agent_id", userAgentId);

  if (error) {
    throw new Error(`Failed to remove catalog entries: ${error.message}`);
  }

  return catalogCount;
}

/**
 * Delete a user-agent.
 * catalog_agents entries are automatically deleted via ON DELETE CASCADE.
 *
 * @returns { deleted: boolean, catalogCount: number }
 */
export async function deleteUserAgent(
  userAgentId: string,
  workspaceId: string
): Promise<{ deleted: boolean; catalogCount: number }> {
  const supabase = await createServerClient();

  // Check it exists and belongs to workspace
  const existing = await getUserAgentById(userAgentId, workspaceId);
  if (!existing) {
    return { deleted: false, catalogCount: 0 };
  }

  // Count linked catalogs before deletion (for warning message)
  const { count } = await supabase
    .from("catalog_agents")
    .select("catalog_id", { count: "exact", head: true })
    .eq("user_agent_id", userAgentId);

  const catalogCount = count ?? 0;

  // Delete the user-agent (cascade removes catalog_agents entries)
  const { error } = await supabase
    .from("user_agents")
    .delete()
    .eq("id", userAgentId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to delete user-agent: ${error.message}`);
  }

  return { deleted: true, catalogCount };
}

/**
 * Duplicate a user-agent as a custom bot (is_preset = false).
 *
 * Generates a unique name following the pattern:
 *   "OriginalName (copy)", "OriginalName (copy 2)", "OriginalName (copy 3)", …
 *
 * @param userAgentId - The source bot's UUID
 * @param workspaceId - The workspace the bot must belong to
 * @returns The newly created custom bot, or null if source not found
 */
export async function duplicateUserAgent(
  userAgentId: string,
  workspaceId: string
): Promise<UserAgentRow | null> {
  const source = await getUserAgentById(userAgentId, workspaceId);
  if (!source) return null;

  const supabase = await createServerClient();

  // Find a unique name
  const baseName = `${source.name} (copy)`;
  const { data: siblings } = await supabase
    .from("user_agents")
    .select("name")
    .eq("workspace_id", workspaceId)
    .like("name", `${source.name} (copy%`);

  const existingNames = new Set((siblings ?? []).map((s: { name: string }) => s.name));

  let candidateName = baseName;
  if (existingNames.has(candidateName)) {
    let counter = 2;
    while (existingNames.has(`${source.name} (copy ${counter})`)) {
      counter++;
    }
    candidateName = `${source.name} (copy ${counter})`;
  }

  return createUserAgent(workspaceId, {
    name: candidateName,
    ua_pattern: source.ua_pattern,
    is_preset: false,
    dns_patterns: source.dns_patterns,
  });
}
