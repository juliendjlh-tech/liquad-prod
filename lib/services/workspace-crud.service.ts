// ---------------------------------------------------------------------------
// Workspace CRUD service
//
// Handles workspace creation, listing, and detail retrieval.
// Extracted from workspace.service.ts for single-responsibility.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { generateApiKey, hashApiKey } from "@/lib/services/workspace-apikey.service";

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new workspace with the authenticated user as owner.
 *
 * Steps:
 * 1. Generate a random API key (lq_ prefix + 40 random chars).
 * 2. Hash the API key with scrypt for secure storage.
 * 3. INSERT into workspaces (name, api_key_hash, api_key_prefix).
 * 4. INSERT into workspace_members (workspace_id, user_id, role='owner').
 * 5. Return the workspace data WITH the plaintext API key.
 *    This is the ONLY time the plaintext key is returned.
 *
 * @param userId - The authenticated user's UUID
 * @param name - The workspace name (already validated by Zod schema)
 * @returns Created workspace with the plaintext API key (shown once)
 */
export async function createWorkspace(
  userId: string,
  name: string
): Promise<{ id: string; name: string; api_key: string; created_at: string }> {
  const supabase = await createServerClient();

  // Generate and hash the API key
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);

  // Insert the workspace with the hashed key
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .insert({ name, api_key_hash: apiKeyHash, api_key_prefix: apiKey.slice(0, 11) })
    .select("id, name, created_at")
    .single();

  if (wsError || !workspace) {
    throw new Error(`Failed to create workspace: ${wsError?.message}`);
  }

  // Add the creator as owner in workspace_members
  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: "owner",
      accepted_at: new Date().toISOString(),
    });

  if (memberError) {
    throw new Error(`Failed to add owner to workspace: ${memberError.message}`);
  }

  // Return workspace data with the plaintext API key (shown once, never again)
  return {
    id: workspace.id,
    name: workspace.name,
    api_key: apiKey,
    created_at: workspace.created_at!,
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List all workspaces the authenticated user belongs to.
 *
 * Returns each workspace with the user's role in it.
 * The API key is NEVER included in list responses (security).
 *
 * @param userId - The authenticated user's UUID
 * @returns Array of workspaces with the user's role, ordered by created_at
 */
export async function getUserWorkspaces(
  userId: string
): Promise<
  Array<{ id: string; name: string; role: string; created_at: string }>
> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id, name, created_at)")
    .eq("user_id", userId)
    .order("created_at", { referencedTable: "workspaces", ascending: true });

  if (error) {
    throw new Error(`Failed to list workspaces: ${error.message}`);
  }

  // Flatten the joined result into a flat array
  return (data || [])
    .filter((row) => row.workspaces !== null)
    .map((row) => {
      const ws = row.workspaces as unknown as {
        id: string;
        name: string;
        created_at: string;
      };
      return {
        id: ws.id,
        name: ws.name,
        role: row.role ?? "viewer",
        created_at: ws.created_at,
      };
    });
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/**
 * Get workspace details if the user is a member.
 *
 * Returns the workspace with the user's role, plus aggregate counts
 * (domain_count, member_count, balance_eur) for the dashboard header.
 *
 * Returns null if the workspace doesn't exist or the user is not a member.
 * This prevents leaking workspace existence to non-members.
 *
 * @param workspaceId - The workspace UUID
 * @param userId - The authenticated user's UUID
 * @returns Workspace details or null if not found/not a member
 */
export async function getWorkspaceById(
  workspaceId: string,
  userId: string
): Promise<{
  id: string;
  name: string;
  role: string;
  created_at: string;
  domain_count: number;
  member_count: number;
  balance_eur: number;
} | null> {
  const supabase = await createServerClient();

  // Check if the user is a member and get their role
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (memberError || !membership) {
    return null;
  }

  // Fetch workspace details
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, created_at, balance_eur")
    .eq("id", workspaceId)
    .single();

  if (wsError || !workspace) {
    return null;
  }

  // Count domains for this workspace
  const { count: domainCount } = await supabase
    .from("domains")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // Count members for this workspace
  const { count: memberCount } = await supabase
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  return {
    id: workspace.id,
    name: workspace.name,
    role: membership.role ?? "viewer",
    created_at: workspace.created_at!,
    domain_count: domainCount ?? 0,
    member_count: memberCount ?? 0,
    balance_eur: workspace.balance_eur ?? 0,
  };
}
