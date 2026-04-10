// ---------------------------------------------------------------------------
// Workspace Members service
//
// Handles member listing, invitation, removal, and role changes.
// Extracted from workspace.service.ts for single-responsibility.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";

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
// Member Listing
// ---------------------------------------------------------------------------

/**
 * List all members of a workspace with their email and role.
 *
 * Any workspace member (owner, admin, or member) can call this.
 * Email lookup uses Supabase Admin API since workspace_members
 * only stores user_id UUIDs.
 *
 * @param workspaceId - The workspace UUID
 * @param callerUserId - The user requesting the list (for membership check)
 * @returns Array of members with email, role, and invite timestamps
 * @throws Error with "NOT_MEMBER" if caller is not a workspace member
 */
export async function getWorkspaceMembers(
  workspaceId: string,
  callerUserId: string
): Promise<WorkspaceMember[]> {
  const supabase = await createServerClient();

  // Verify the caller is a member (any role can list)
  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", callerUserId)
    .single();

  if (!callerMembership) {
    throw new Error("NOT_MEMBER");
  }

  // Fetch all members ordered by invited_at ASC
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, invited_at, accepted_at")
    .eq("workspace_id", workspaceId)
    .order("invited_at", { ascending: true });

  if (error || !members) {
    throw new Error(`Failed to list members: ${error?.message}`);
  }

  // Batch-lookup emails via Supabase Admin API.
  // For MVP scale (<20 members per workspace), this is acceptable.
  const membersWithEmail = await Promise.all(
    members.map(async (member) => {
      const {
        data: { user },
      } = await supabase.auth.admin.getUserById(member.user_id!);
      return {
        user_id: member.user_id!,
        email: user?.email ?? "unknown",
        role: member.role ?? "viewer",
        invited_at: member.invited_at!,
        accepted_at: member.accepted_at,
      };
    })
  );

  return membersWithEmail;
}

// ---------------------------------------------------------------------------
// Member Invitation
// ---------------------------------------------------------------------------

/**
 * Invite a user to a workspace by email.
 *
 * MVP simplification: invitations are auto-accepted (no email flow).
 * Only owner or admin can invite.
 *
 * @param workspaceId - The workspace UUID
 * @param inviterUserId - The user performing the invite
 * @param email - Email of the user to invite
 * @param role - Role to assign ('admin' or 'member')
 * @returns The created membership record
 * @throws Error with "NOT_MEMBER" if inviter doesn't belong to workspace
 * @throws Error with "FORBIDDEN" if inviter is a regular member
 * @throws Error with "USER_NOT_FOUND" if no user with that email exists
 * @throws Error with "ALREADY_MEMBER" if the user is already in the workspace
 */
export async function inviteMember(
  workspaceId: string,
  inviterUserId: string,
  email: string,
  role: "admin" | "member"
): Promise<{ user_id: string; role: string; invited_at: string }> {
  const supabase = await createServerClient();

  // Check inviter's membership and permissions
  const { data: inviterMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", inviterUserId)
    .single();

  if (!inviterMembership) {
    throw new Error("NOT_MEMBER");
  }

  // Only owner and admin can invite new members
  if (inviterMembership.role === "member") {
    throw new Error("FORBIDDEN");
  }

  // Look up the target user by email using Supabase Admin API
  const {
    data: { users },
    error: lookupError,
  } = await supabase.auth.admin.listUsers();

  if (lookupError) {
    throw new Error(`Failed to lookup user: ${lookupError.message}`);
  }

  // Find the user with the matching email (case-insensitive)
  const targetUser = users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!targetUser) {
    throw new Error("USER_NOT_FOUND");
  }

  // Check if the user is already a member
  const { data: existingMember } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUser.id)
    .single();

  if (existingMember) {
    throw new Error("ALREADY_MEMBER");
  }

  // Insert the new member (auto-accept for MVP)
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
    role: newMember.role ?? "viewer",
    invited_at: newMember.invited_at!,
  };
}

// ---------------------------------------------------------------------------
// Member Removal
// ---------------------------------------------------------------------------

/**
 * Remove a member from a workspace.
 *
 * Only owner or admin can remove members.
 * The workspace owner cannot be removed (prevents orphaned workspaces).
 *
 * @param workspaceId - The workspace UUID
 * @param memberId - The user_id of the member to remove
 * @param callerUserId - The user performing the removal
 * @throws Error with "NOT_MEMBER" if caller doesn't belong to workspace
 * @throws Error with "FORBIDDEN" if caller is a regular member
 * @throws Error with "CANNOT_REMOVE_OWNER" if trying to remove the owner
 * @throws Error with "MEMBER_NOT_FOUND" if target member doesn't exist
 */
export async function removeMember(
  workspaceId: string,
  memberId: string,
  callerUserId: string
): Promise<void> {
  const supabase = await createServerClient();

  // Check caller's membership and permissions
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

  // Check the target member exists and get their role
  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId)
    .single();

  if (!targetMember) {
    throw new Error("MEMBER_NOT_FOUND");
  }

  // Owner cannot be removed — prevents orphaned workspaces
  if (targetMember.role === "owner") {
    throw new Error("CANNOT_REMOVE_OWNER");
  }

  // Delete the membership record
  const { error: deleteError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId);

  if (deleteError) {
    throw new Error(`Failed to remove member: ${deleteError.message}`);
  }
}

// ---------------------------------------------------------------------------
// Role Management
// ---------------------------------------------------------------------------

/**
 * Change a member's role in a workspace.
 *
 * Only the owner can change roles (not admin).
 * Cannot change the owner's own role (prevents accidental demotion).
 *
 * @param workspaceId - The workspace UUID
 * @param memberId - The user_id of the member whose role to change
 * @param newRole - The new role ('admin' or 'member')
 * @param callerUserId - The user performing the role change
 * @throws Error with "NOT_MEMBER" if caller doesn't belong to workspace
 * @throws Error with "FORBIDDEN" if caller is not the owner
 * @throws Error with "CANNOT_CHANGE_OWNER" if target is the owner
 * @throws Error with "MEMBER_NOT_FOUND" if target member doesn't exist
 */
export async function changeMemberRole(
  workspaceId: string,
  memberId: string,
  newRole: "admin" | "member",
  callerUserId: string
): Promise<void> {
  const supabase = await createServerClient();

  // Check caller's membership — must be the owner
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

  // Check the target member exists
  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId)
    .single();

  if (!targetMember) {
    throw new Error("MEMBER_NOT_FOUND");
  }

  // Cannot change the owner's role
  if (targetMember.role === "owner") {
    throw new Error("CANNOT_CHANGE_OWNER");
  }

  // Update the role
  const { error: updateError } = await supabase
    .from("workspace_members")
    .update({ role: newRole })
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId);

  if (updateError) {
    throw new Error(`Failed to change role: ${updateError.message}`);
  }
}
