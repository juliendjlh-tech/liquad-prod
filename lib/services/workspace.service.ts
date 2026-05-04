// ---------------------------------------------------------------------------
// Workspace service
//
// Consolidated from:
//   - workspace-crud.service.ts (CRUD operations)
//   - workspace-apikey.service.ts (API key crypto)
//   - workspace-members.service.ts (members RBAC)
// ---------------------------------------------------------------------------

import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { createServerClient } from "@/lib/db/supabase-server";

const scryptAsync = promisify(scrypt);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceMember {
  user_id: string;
  email: string;
  role: string;
  invited_at: string;
  accepted_at: string | null;
}

// ---------------------------------------------------------------------------
// API Key — Generation & Hashing
// ---------------------------------------------------------------------------

/**
 * Generate a random API key with prefix "lq_".
 * Format: `lq_` + 40 random alphanumeric characters (base64url).
 * 240 bits of entropy.
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(30).toString("base64url").slice(0, 40);
  return `lq_${randomPart}`;
}

/**
 * Hash an API key using scrypt for secure storage.
 * Output format: `<salt_hex>:<hash_hex>`
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scryptAsync(apiKey, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Verify an API key against a stored scrypt hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyApiKey(
  apiKey: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(hashHex, "hex");
  const derivedKey = (await scryptAsync(apiKey, salt, 64)) as Buffer;
  return timingSafeEqual(storedKey, derivedKey);
}

// ---------------------------------------------------------------------------
// API Key — Rotation
// ---------------------------------------------------------------------------

/**
 * Regenerate the API key for a workspace. Owner only.
 * The old key is IMMEDIATELY invalidated.
 */
export async function regenerateApiKey(
  workspaceId: string,
  userId: string
): Promise<string> {
  const supabase = await createServerClient();

  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (memberError || !membership) {
    throw new Error("NOT_MEMBER");
  }

  if (membership.role !== "owner") {
    throw new Error("FORBIDDEN");
  }

  const newApiKey = generateApiKey();
  const newHash = await hashApiKey(newApiKey);

  const { error: updateError } = await supabase
    .from("workspaces")
    .update({
      api_key_hash: newHash,
      api_key_prefix: newApiKey.slice(0, 11),
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  if (updateError) {
    throw new Error(`UPDATE_FAILED: ${updateError.message}`);
  }

  return newApiKey;
}

// ---------------------------------------------------------------------------
// Workspace CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new workspace with the authenticated user as owner.
 * Returns the workspace WITH the plaintext API key (shown once).
 */
export async function createWorkspace(
  userId: string,
  name: string
): Promise<{ id: string; name: string; api_key: string; created_at: string }> {
  const supabase = await createServerClient();

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .insert({ name, api_key_hash: apiKeyHash, api_key_prefix: apiKey.slice(0, 11) })
    .select("id, name, created_at")
    .single();

  if (wsError || !workspace) {
    throw new Error(`Failed to create workspace: ${wsError?.message}`);
  }

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

  return {
    id: workspace.id,
    name: workspace.name,
    api_key: apiKey,
    created_at: workspace.created_at!,
  };
}

/**
 * List all workspaces the authenticated user belongs to.
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
        role: row.role ?? "member",
        created_at: ws.created_at,
      };
    });
}

/**
 * Get workspace details if the user is a member.
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
} | null> {
  const supabase = await createServerClient();

  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (memberError || !membership) {
    return null;
  }

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, created_at")
    .eq("id", workspaceId)
    .single();

  if (wsError || !workspace) {
    return null;
  }

  const { count: domainCount } = await supabase
    .from("domains")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  const { count: memberCount } = await supabase
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  return {
    id: workspace.id,
    name: workspace.name,
    role: membership.role ?? "member",
    created_at: workspace.created_at!,
    domain_count: domainCount ?? 0,
    member_count: memberCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * List all members of a workspace with their email and role.
 */
export async function getWorkspaceMembers(
  workspaceId: string,
  callerUserId: string
): Promise<WorkspaceMember[]> {
  const supabase = await createServerClient();

  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", callerUserId)
    .single();

  if (!callerMembership) {
    throw new Error("NOT_MEMBER");
  }

  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, invited_at, accepted_at")
    .eq("workspace_id", workspaceId)
    .order("invited_at", { ascending: true });

  if (error || !members) {
    throw new Error(`Failed to list members: ${error?.message}`);
  }

  const membersWithEmail = await Promise.all(
    members.map(async (member) => {
      const {
        data: { user },
      } = await supabase.auth.admin.getUserById(member.user_id!);
      return {
        user_id: member.user_id!,
        email: user?.email ?? "unknown",
        role: member.role ?? "member",
        invited_at: member.invited_at!,
        accepted_at: member.accepted_at,
      };
    })
  );

  return membersWithEmail;
}

/**
 * Invite a user to a workspace by email. Auto-accepted for MVP.
 */
export async function inviteMember(
  workspaceId: string,
  inviterUserId: string,
  email: string,
  role: "admin" | "member"
): Promise<{ user_id: string; role: string; invited_at: string }> {
  const supabase = await createServerClient();

  const { data: inviterMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", inviterUserId)
    .single();

  if (!inviterMembership) {
    throw new Error("NOT_MEMBER");
  }

  if (inviterMembership.role === "member") {
    throw new Error("FORBIDDEN");
  }

  const {
    data: { users },
    error: lookupError,
  } = await supabase.auth.admin.listUsers();

  if (lookupError) {
    throw new Error(`Failed to lookup user: ${lookupError.message}`);
  }

  let targetUser = users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!targetUser) {
    const { data: inviteData, error: inviteError } =
      await supabase.auth.admin.inviteUserByEmail(email);
    if (inviteError || !inviteData.user) {
      throw new Error(`Failed to invite user: ${inviteError?.message}`);
    }
    targetUser = inviteData.user;
  }

  const { data: existingMember } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUser.id)
    .single();

  if (existingMember) {
    throw new Error("ALREADY_MEMBER");
  }

  const now = new Date().toISOString();
  const { data: newMember, error: insertError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspaceId,
      user_id: targetUser.id,
      role,
      invited_at: now,
      accepted_at: now,
    })
    .select("user_id, role, invited_at")
    .single();

  if (insertError || !newMember) {
    throw new Error(`Failed to invite member: ${insertError?.message}`);
  }

  return {
    user_id: newMember.user_id!,
    role: newMember.role ?? "member",
    invited_at: newMember.invited_at!,
  };
}

/**
 * Remove a member from a workspace. Owner/admin only.
 */
export async function removeMember(
  workspaceId: string,
  memberId: string,
  callerUserId: string
): Promise<void> {
  const supabase = await createServerClient();

  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", callerUserId)
    .single();

  if (!callerMembership) {
    throw new Error("NOT_MEMBER");
  }

  if (callerMembership.role === "member") {
    throw new Error("FORBIDDEN");
  }

  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId)
    .single();

  if (!targetMember) {
    throw new Error("MEMBER_NOT_FOUND");
  }

  if (targetMember.role === "owner") {
    throw new Error("CANNOT_REMOVE_OWNER");
  }

  const { error: deleteError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId);

  if (deleteError) {
    throw new Error(`Failed to remove member: ${deleteError.message}`);
  }
}

/**
 * Change a member's role. Owner only.
 */
export async function changeMemberRole(
  workspaceId: string,
  memberId: string,
  newRole: "admin" | "member",
  callerUserId: string
): Promise<void> {
  const supabase = await createServerClient();

  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", callerUserId)
    .single();

  if (!callerMembership) {
    throw new Error("NOT_MEMBER");
  }

  if (callerMembership.role !== "owner") {
    throw new Error("FORBIDDEN");
  }

  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId)
    .single();

  if (!targetMember) {
    throw new Error("MEMBER_NOT_FOUND");
  }

  if (targetMember.role === "owner") {
    throw new Error("CANNOT_CHANGE_OWNER");
  }

  const { error: updateError } = await supabase
    .from("workspace_members")
    .update({ role: newRole })
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId);

  if (updateError) {
    throw new Error(`Failed to change role: ${updateError.message}`);
  }
}
