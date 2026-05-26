import { createServerClient } from "@/lib/db/supabase-server";
import { getWorkspaceBots as queryWorkspaceBots } from "@/lib/db/queries/agents";
import { generatePublicId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// AI Bot Presets
// ---------------------------------------------------------------------------
// Each preset represents a well-known AI bot. These are seeded into the
// global bots table by migration 018 and typed as 'preset' by migration 027.
// The list here is used to enrich the presets API with the operator field
// (display-only, not stored in DB).

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

// Lookup map for enriching DB preset rows with operator info (display-only)
const PRESET_OPERATOR_MAP = new Map(
  AI_BOT_PRESETS.map((p) => [p.name, p.operator])
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BotRow {
  id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: 'preset' | 'custom';
  description?: string | null;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// CRUD Functions
// ---------------------------------------------------------------------------

const BOT_SELECT_COLUMNS = "id, public_id, name, ua_pattern, declared_ips, type, description, created_at";

/**
 * List all bots active for a workspace (via workspace_bots junction).
 */
export async function getWorkspaceBots(
  workspaceId: string
): Promise<BotRow[]> {
  return queryWorkspaceBots(workspaceId) as Promise<BotRow[]>;
}

/**
 * Get all preset bots from DB, enriched with operator from the in-memory list.
 */
export async function getPresetBots(): Promise<Array<BotRow & { operator?: string }>> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("bots")
    .select(BOT_SELECT_COLUMNS)
    .eq("type", "preset")
    .order("name");

  if (error) throw new Error(`Failed to fetch preset bots: ${error.message}`);

  return (data ?? []).map((row) => ({
    ...(row as BotRow),
    operator: PRESET_OPERATOR_MAP.get(row.name),
  }));
}

/**
 * Get a single bot by ID. The optional `workspaceId` parameter is currently
 * unused — kept for API symmetry with callers that pass it.
 */
export async function getBotById(
  botId: string,
  _workspaceId?: string
): Promise<BotRow | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("bots")
    .select(BOT_SELECT_COLUMNS)
    .eq("id", botId)
    .single();

  if (error || !data) return null;
  return data as BotRow;
}

/**
 * Subscribe a workspace to a preset bot.
 * The preset must already exist in the bots table (type = 'preset').
 */
export async function subscribeToPreset(
  workspaceId: string,
  name: string
): Promise<BotRow> {
  const supabase = await createServerClient();

  const { data: bot } = await supabase
    .from("bots")
    .select(BOT_SELECT_COLUMNS)
    .eq("name", name)
    .single();

  if (!bot) throw new Error("PRESET_NOT_FOUND");
  if ((bot as BotRow).type !== "preset") throw new Error("NOT_A_PRESET");

  const { error: linkError } = await supabase
    .from("workspace_bots")
    .insert({ workspace_id: workspaceId, bot_id: bot.id });

  if (linkError) {
    if (linkError.code === "23505") throw new Error("ALREADY_IN_WORKSPACE");
    throw new Error(`Failed to subscribe to preset: ${linkError.message}`);
  }

  return bot as BotRow;
}

/**
 * Create a custom bot and link it to the workspace.
 * Custom bots are owned by exactly one workspace: they are deleted when
 * the workspace unsubscribes (removeBotFromWorkspace).
 */
export async function createCustomBot(
  workspaceId: string,
  data: { name: string; ua_pattern: string; description?: string; declared_ips: string[] }
): Promise<BotRow> {
  const supabase = await createServerClient();

  // Check name is not already taken
  const { data: existing } = await supabase
    .from("bots")
    .select("id, type")
    .eq("name", data.name)
    .maybeSingle();

  if (existing) {
    if ((existing as { type: string }).type === "preset") throw new Error("NAME_CONFLICT_WITH_PRESET");
    throw new Error("CUSTOM_BOT_ALREADY_EXISTS");
  }

  const { data: created, error } = await supabase
    .from("bots")
    .insert({
      public_id: generatePublicId("bot"),
      name: data.name,
      ua_pattern: data.ua_pattern,
      description: data.description ?? null,
      declared_ips: data.declared_ips,
      type: "custom",
    })
    .select(BOT_SELECT_COLUMNS)
    .single();

  if (error || !created) throw new Error(`Failed to create bot: ${error?.message}`);

  const { error: linkError } = await supabase
    .from("workspace_bots")
    .insert({ workspace_id: workspaceId, bot_id: created.id });

  if (linkError) {
    // Rollback bot creation to avoid orphans
    await supabase.from("bots").delete().eq("id", created.id);
    throw new Error(`Failed to link bot to workspace: ${linkError.message}`);
  }

  return created as BotRow;
}

/**
 * Remove a bot from a workspace (unsubscribe).
 * For custom bots, also deletes the global bot record (and all associated
 * data via DB cascade) since custom bots are owned by exactly one workspace.
 */
export async function removeBotFromWorkspace(
  workspaceId: string,
  botId: string
): Promise<{ removed: boolean; catalogCount: number }> {
  const supabase = await createServerClient();

  // Check the link exists and get bot type
  const { data: link } = await supabase
    .from("workspace_bots")
    .select("bot_id")
    .eq("workspace_id", workspaceId)
    .eq("bot_id", botId)
    .single();

  if (!link) return { removed: false, catalogCount: 0 };

  const { data: bot } = await supabase
    .from("bots")
    .select("id, type")
    .eq("id", botId)
    .single();

  // Count linked catalogs before removal
  const { count } = await supabase
    .from("catalog_bots")
    .select("catalog_id", { count: "exact", head: true })
    .eq("bot_id", botId);

  const catalogCount = count ?? 0;

  // Remove catalog links for this bot in this workspace's catalogs
  if (catalogCount > 0) {
    const { data: workspaceCatalogs } = await supabase
      .from("catalogs")
      .select("id")
      .eq("workspace_id", workspaceId);

    const catalogIds = (workspaceCatalogs ?? []).map((c: { id: string }) => c.id);
    if (catalogIds.length > 0) {
      await supabase
        .from("catalog_bots")
        .delete()
        .eq("bot_id", botId)
        .in("catalog_id", catalogIds);
    }
  }

  if (bot && (bot as { type: string }).type === "custom") {
    // Deleting the bots row cascades to workspace_bots.
    const { error } = await supabase
      .from("bots")
      .delete()
      .eq("id", botId);

    if (error) throw new Error(`Failed to delete custom bot: ${error.message}`);
  } else {
    // Preset: only remove the workspace subscription
    const { error } = await supabase
      .from("workspace_bots")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("bot_id", botId);

    if (error) throw new Error(`Failed to remove bot from workspace: ${error.message}`);
  }

  return { removed: true, catalogCount };
}

/**
 * Update a custom bot's properties.
 * Presets cannot be edited by clients (pass callerWorkspaceId = null for admin).
 */
export async function updateBot(
  botId: string,
  data: { name?: string; ua_pattern?: string; description?: string; declared_ips?: string[] },
  callerWorkspaceId: string | null
): Promise<BotRow | null> {
  const supabase = await createServerClient();

  // Fetch bot to check type and verify caller has access
  const { data: bot } = await supabase
    .from("bots")
    .select("id, type")
    .eq("id", botId)
    .single();

  if (!bot) return null;

  if ((bot as { type: string }).type === "preset") {
    if (callerWorkspaceId !== null) throw new Error("PRESET_IMMUTABLE");
  } else {
    // Custom bot: verify the caller's workspace owns it (has it in workspace_bots)
    if (callerWorkspaceId !== null) {
      const { data: link } = await supabase
        .from("workspace_bots")
        .select("bot_id")
        .eq("bot_id", botId)
        .eq("workspace_id", callerWorkspaceId)
        .maybeSingle();

      if (!link) throw new Error("NOT_OWNER");
    }
  }

  const { data: updated, error } = await supabase
    .from("bots")
    .update(data)
    .eq("id", botId)
    .select(BOT_SELECT_COLUMNS)
    .single();

  if (error || !updated) return null;
  return updated as BotRow;
}

/**
 * Remove all catalog_bots entries for a given bot.
 */
export async function removeCatalogEntriesForBot(
  botId: string
): Promise<number> {
  const supabase = await createServerClient();

  const { count } = await supabase
    .from("catalog_bots")
    .select("catalog_id", { count: "exact", head: true })
    .eq("bot_id", botId);

  const catalogCount = count ?? 0;
  if (catalogCount === 0) return 0;

  const { error } = await supabase
    .from("catalog_bots")
    .delete()
    .eq("bot_id", botId);

  if (error) throw new Error(`Failed to remove catalog entries: ${error.message}`);

  return catalogCount;
}
