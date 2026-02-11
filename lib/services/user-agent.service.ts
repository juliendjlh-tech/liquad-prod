import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// AI Bot Presets (PRD Appendix A)
// ---------------------------------------------------------------------------

export const AI_BOT_PRESETS: Array<{
  name: string;
  ua_pattern: string;
  operator: string;
}> = [
  { name: "GPTBot", ua_pattern: "GPTBot", operator: "OpenAI" },
  { name: "ChatGPT-User", ua_pattern: "ChatGPT-User", operator: "OpenAI" },
  { name: "ClaudeBot", ua_pattern: "ClaudeBot", operator: "Anthropic" },
  { name: "PerplexityBot", ua_pattern: "PerplexityBot", operator: "Perplexity" },
  { name: "Google-Extended", ua_pattern: "Google-Extended", operator: "Google" },
  { name: "Bytespider", ua_pattern: "Bytespider", operator: "ByteDance" },
  { name: "CCBot", ua_pattern: "CCBot", operator: "Common Crawl" },
  { name: "Amazonbot", ua_pattern: "Amazonbot", operator: "Amazon" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserAgentRow {
  id: string;
  workspace_id: string;
  name: string;
  ua_pattern: string;
  is_active: boolean;
  is_preset: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CRUD Functions
// ---------------------------------------------------------------------------

/**
 * Create a new user-agent for a workspace.
 *
 * Checks for duplicate name per workspace before insert.
 *
 * @throws Error with "DUPLICATE_NAME" if name already exists in workspace
 */
export async function createUserAgent(
  workspaceId: string,
  data: { name: string; ua_pattern: string; is_preset?: boolean }
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
    })
    .select("id, workspace_id, name, ua_pattern, is_active, is_preset, created_at")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create user-agent: ${error?.message}`);
  }

  return created as UserAgentRow;
}

/**
 * List all user-agents for a workspace.
 * Ordered by created_at ASC.
 */
export async function getUserAgents(
  workspaceId: string
): Promise<UserAgentRow[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_agents")
    .select("id, workspace_id, name, ua_pattern, is_active, is_preset, created_at")
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
 * @returns User-agent record or null if not found/wrong workspace
 */
export async function getUserAgentById(
  userAgentId: string,
  workspaceId: string
): Promise<UserAgentRow | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_agents")
    .select("id, workspace_id, name, ua_pattern, is_active, is_preset, created_at")
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
 * Supports name, ua_pattern, and is_active fields.
 *
 * @returns Updated record or null if not found/wrong workspace
 */
export async function updateUserAgent(
  userAgentId: string,
  workspaceId: string,
  data: { name?: string; ua_pattern?: string; is_active?: boolean }
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
    .select("id, workspace_id, name, ua_pattern, is_active, is_preset, created_at")
    .single();

  if (error || !updated) {
    throw new Error(`Failed to update user-agent: ${error?.message}`);
  }

  return updated as UserAgentRow;
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
