import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * Promisified version of Node.js crypto.scrypt.
 * scrypt is a password-based key derivation function recommended by OWASP
 * for hashing secrets. Unlike SHA-256, it is intentionally slow and
 * memory-hard, making brute-force attacks expensive.
 */
const scryptAsync = promisify(scrypt);

// ---------------------------------------------------------------------------
// API Key Generation & Hashing
// ---------------------------------------------------------------------------

/**
 * Generate a random API key with prefix "df_".
 *
 * Format: `df_` + 40 random alphanumeric characters.
 * Total length: 43 characters.
 *
 * The "df_" prefix makes Liquad API keys visually identifiable
 * in configuration files and logs (similar to how Stripe uses "sk_"
 * and GitHub uses "ghp_").
 *
 * Uses Node.js built-in `crypto.randomBytes()` for cryptographically
 * secure random generation — no external dependencies needed.
 *
 * @returns The plaintext API key (e.g., "df_a1b2c3d4e5f6...")
 *
 * @example
 * ```typescript
 * const apiKey = generateApiKey();
 * // "df_x7k9m2p4q8r1s5t3u6v0w2y4z7a9b1c3d5f8g0h2"
 * ```
 */
export function generateApiKey(): string {
  // Generate 30 random bytes → encode as base64url → take first 40 chars.
  // base64url uses [A-Za-z0-9_-] which is safe for HTTP headers and URLs.
  // 30 bytes of entropy = 240 bits, far more than the 128-bit minimum
  // recommended for API keys.
  const randomPart = randomBytes(30).toString("base64url").slice(0, 40);
  return `df_${randomPart}`;
}

/**
 * Hash an API key using scrypt for secure storage.
 *
 * WHY scrypt instead of SHA-256:
 * Although API keys have high entropy (unlike passwords), using a
 * password-grade hash provides defense-in-depth. If the database is
 * compromised, scrypt makes it computationally expensive to reverse
 * the hashes, even with dedicated hardware.
 *
 * The output format is: `<salt_hex>:<hash_hex>`
 * - salt: 16 random bytes (128 bits) to prevent rainbow table attacks
 * - hash: 64-byte scrypt output
 *
 * Uses Node.js built-in `crypto.scrypt` — zero external dependencies.
 *
 * @param apiKey - The plaintext API key to hash
 * @returns The hash string in format "salt:hash" (both hex-encoded)
 *
 * @example
 * ```typescript
 * const hash = await hashApiKey("df_abc123...");
 * // "a1b2c3d4...:e5f6g7h8..."
 * ```
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scryptAsync(apiKey, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Verify an API key against a stored scrypt hash.
 *
 * Uses `crypto.timingSafeEqual()` to prevent timing attacks:
 * a constant-time comparison that doesn't leak information about
 * which bytes differ between the expected and actual hash.
 *
 * @param apiKey - The plaintext API key to verify
 * @param storedHash - The stored hash in "salt:hash" format
 * @returns true if the key matches the hash
 *
 * @example
 * ```typescript
 * const isValid = await verifyApiKey("df_abc123...", storedHash);
 * if (!isValid) {
 *   return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
 * }
 * ```
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
// Workspace CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new workspace with the authenticated user as owner.
 *
 * STEPS:
 * 1. Generate a random API key (df_ prefix + 40 random chars).
 * 2. Hash the API key with scrypt for secure storage.
 * 3. INSERT into workspaces (name, api_key_hash).
 * 4. INSERT into workspace_members (workspace_id, user_id, role='owner',
 *    invited_at=now(), accepted_at=now()).
 * 5. Return the workspace data WITH the plaintext API key.
 *    This is the ONLY time the plaintext key is returned — it cannot
 *    be retrieved later because only the hash is stored.
 *
 * WHY the owner is auto-added as a member:
 * The workspace_members table is the source of truth for workspace access.
 * RLS policies and service layer checks both use it. The creator must be
 * a member with the "owner" role to access their own workspace.
 *
 * @param userId - The authenticated user's UUID (from supabase.auth.getUser())
 * @param name - The workspace name (already validated by Zod schema)
 * @returns Created workspace with the plaintext API key (shown once)
 * @throws Error if the database insert fails
 */
export async function createWorkspace(
  userId: string,
  name: string
): Promise<{ id: string; name: string; api_key: string; created_at: string }> {
  const supabase = await createServerClient();

  // Step 1-2: Generate and hash the API key
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);

  // Step 3: Insert the workspace with the hashed key
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .insert({ name, api_key_hash: apiKeyHash, api_key_prefix: apiKey.slice(0, 11) })
    .select("id, name, created_at")
    .single();

  if (wsError || !workspace) {
    throw new Error(`Failed to create workspace: ${wsError?.message}`);
  }

  // Step 4: Add the creator as owner in workspace_members
  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: "owner",
      accepted_at: new Date().toISOString(),
    });

  if (memberError) {
    // If adding the member fails, the workspace was created but is
    // inaccessible. This should not happen in practice, but if it does,
    // we throw to surface the issue.
    throw new Error(`Failed to add owner to workspace: ${memberError.message}`);
  }

  // Step 5: Return workspace data with the plaintext API key.
  // After this response, the key is never shown again.
  return {
    id: workspace.id,
    name: workspace.name,
    api_key: apiKey,
    created_at: workspace.created_at!,
  };
}

/**
 * List all workspaces the authenticated user belongs to.
 *
 * Returns each workspace with the user's role in it.
 * The API key is NEVER included in list responses (security).
 *
 * QUERY APPROACH:
 * We query workspace_members filtered by user_id, then join workspaces
 * to get workspace details. This leverages the fact that workspace_members
 * is the single source of truth for workspace access.
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

  // Transform the joined result into a flat array.
  // Supabase returns the join as a nested object: { role, workspaces: { id, name, created_at } }
  return (data || [])
    .filter((row) => row.workspaces !== null)
    .map((row) => {
      // Supabase returns the joined table as an object (single relation)
      const ws = row.workspaces as unknown as {
        id: string;
        name: string;
        created_at: string;
      };
      return {
        id: ws.id,
        name: ws.name,
        role: row.role,
        created_at: ws.created_at,
      };
    });
}

/**
 * Get workspace details if the user is a member.
 *
 * Returns the workspace with the user's role, plus aggregate counts
 * (domain_count, member_count) for the dashboard header.
 *
 * Returns null if the workspace doesn't exist or the user is not a member.
 * This prevents leaking workspace existence to non-members (they get 404,
 * not 403).
 *
 * @param workspaceId - The workspace UUID (from URL params)
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
} | null> {
  const supabase = await createServerClient();

  // First, check if the user is a member and get their role
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (memberError || !membership) {
    // User is not a member or workspace doesn't exist → return null (404)
    return null;
  }

  // Fetch workspace details
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, created_at")
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
    role: membership.role,
    created_at: workspace.created_at!,
    domain_count: domainCount ?? 0,
    member_count: memberCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// API Key Rotation
// ---------------------------------------------------------------------------

/**
 * Regenerate the API key for a workspace.
 * Only the workspace owner can perform this action.
 *
 * STEPS:
 * 1. Verify the user is a member of the workspace (return null if not).
 * 2. Verify the user has the "owner" role (throw 403 if admin/member).
 * 3. Generate a new API key (same format as creation: df_ + 40 chars).
 * 4. Hash the new key with scrypt.
 * 5. UPDATE workspaces SET api_key_hash = new_hash, updated_at = now().
 * 6. Return the new plaintext API key (shown once).
 *
 * The old key is IMMEDIATELY invalidated because the hash is overwritten.
 * Any SDK using the old key will receive 401 on its next request to
 * /api/sdk/rules or /api/sdk/events.
 *
 * WHY owner-only:
 * API key regeneration is a high-impact security action. It instantly
 * breaks all SDK deployments using the old key. Only the workspace owner
 * should have this power — admins can manage content and members, but
 * not disrupt live integrations.
 *
 * @param workspaceId - The workspace UUID
 * @param userId - The authenticated user's UUID
 * @returns The new plaintext API key
 * @throws Error with "NOT_MEMBER" if user is not a member (→ 404)
 * @throws Error with "FORBIDDEN" if user is not the owner (→ 403)
 * @throws Error with "UPDATE_FAILED" if the database update fails
 */
export async function regenerateApiKey(
  workspaceId: string,
  userId: string
): Promise<string> {
  const supabase = await createServerClient();

  // Step 1: Check membership and role
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (memberError || !membership) {
    throw new Error("NOT_MEMBER");
  }

  // Step 2: Only owner can regenerate
  if (membership.role !== "owner") {
    throw new Error("FORBIDDEN");
  }

  // Step 3-4: Generate and hash new key
  const newApiKey = generateApiKey();
  const newHash = await hashApiKey(newApiKey);

  // Step 5: Overwrite the old hash — immediate invalidation
  const { error: updateError } = await supabase
    .from("workspaces")
    .update({
      api_key_hash: newHash,
      api_key_prefix: newApiKey.slice(0, 11),
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  if (updateError) {
    throw new Error("UPDATE_FAILED");
  }

  // Step 6: Return new plaintext key (shown once, never again)
  return newApiKey;
}

// ---------------------------------------------------------------------------
// Member Management
// ---------------------------------------------------------------------------

/**
 * List all members of a workspace with their email and role.
 *
 * Any workspace member (owner, admin, or member) can call this.
 * The caller's membership is verified before returning data.
 *
 * HOW EMAIL LOOKUP WORKS:
 * workspace_members stores user_id (UUID), not email. To get the email,
 * we use the Supabase Admin API (auth.admin.listUsers) which requires
 * the service role key. We fetch all members first, then batch-lookup
 * their emails.
 *
 * @param workspaceId - The workspace UUID
 * @param callerUserId - The user requesting the list (for membership check)
 * @returns Array of members with email, role, and invite timestamps
 * @throws Error with "NOT_MEMBER" if caller is not a workspace member
 */
export async function getWorkspaceMembers(
  workspaceId: string,
  callerUserId: string
): Promise<
  Array<{
    user_id: string;
    email: string;
    role: string;
    invited_at: string;
    accepted_at: string | null;
  }>
> {
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

  // Fetch all members of this workspace, ordered by invited_at ASC
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, invited_at, accepted_at")
    .eq("workspace_id", workspaceId)
    .order("invited_at", { ascending: true });

  if (error || !members) {
    throw new Error(`Failed to list members: ${error?.message}`);
  }

  // Batch-lookup emails via Supabase Admin API.
  // We iterate over members and fetch each user's email.
  // For MVP scale (3-5 publishers, <20 members per workspace),
  // this is acceptable. For larger scale, consider a DB view or
  // denormalizing email into workspace_members.
  const membersWithEmail = await Promise.all(
    members.map(async (member) => {
      const {
        data: { user },
      } = await supabase.auth.admin.getUserById(member.user_id!);
      return {
        user_id: member.user_id!,
        email: user?.email ?? "unknown",
        role: member.role,
        invited_at: member.invited_at!,
        accepted_at: member.accepted_at,
      };
    })
  );

  return membersWithEmail;
}

/**
 * Invite a user to a workspace by email.
 *
 * MVP simplification: invitations are auto-accepted (no email flow).
 * The member is immediately added with accepted_at = now().
 *
 * PERMISSION: Only owner or admin can invite.
 *
 * STEPS:
 * 1. Check inviter's membership and role (must be owner or admin).
 * 2. Look up the target user by email in Supabase Auth (admin API).
 * 3. If user not found → throw USER_NOT_FOUND.
 * 4. Check if the target user is already a member → throw ALREADY_MEMBER.
 * 5. INSERT into workspace_members with auto-accept.
 *
 * @param workspaceId - The workspace UUID
 * @param inviterUserId - The user performing the invite
 * @param email - Email of the user to invite
 * @param role - Role to assign ('admin' or 'member')
 * @returns The created membership record
 * @throws Error with "NOT_MEMBER" if inviter doesn't belong to workspace
 * @throws Error with "FORBIDDEN" if inviter is a regular member (not owner/admin)
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

  // Step 1: Check inviter's membership and permissions
  const { data: inviterMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", inviterUserId)
    .single();

  if (!inviterMembership) {
    throw new Error("NOT_MEMBER");
  }

  // Only owner and admin can invite new members.
  // Regular members have read-only access to the workspace.
  if (inviterMembership.role === "member") {
    throw new Error("FORBIDDEN");
  }

  // Step 2: Look up the target user by email using Supabase Admin API.
  // This requires the service role key (which our server client uses).
  // We list users filtered by email — returns an array (0 or 1 match).
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

  // Step 4: Check if the user is already a member
  const { data: existingMember } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUser.id)
    .single();

  if (existingMember) {
    throw new Error("ALREADY_MEMBER");
  }

  // Step 5: Insert the new member (auto-accept for MVP)
  const now = new Date().toISOString();
  const { data: newMember, error: insertError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspaceId,
      user_id: targetUser.id,
      role,
      invited_at: now,
      accepted_at: now, // MVP: auto-accept, no invitation email flow
    })
    .select("user_id, role, invited_at")
    .single();

  if (insertError || !newMember) {
    throw new Error(`Failed to invite member: ${insertError?.message}`);
  }

  return {
    user_id: newMember.user_id!,
    role: newMember.role,
    invited_at: newMember.invited_at!,
  };
}

/**
 * Remove a member from a workspace.
 *
 * PERMISSION: Only owner or admin can remove members.
 * CONSTRAINT: The workspace owner cannot be removed (would leave workspace ownerless).
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

  // Owner cannot be removed — this would leave the workspace ownerless
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

/**
 * Change a member's role in a workspace.
 *
 * PERMISSION: Only the owner can change roles.
 * CONSTRAINTS:
 * - Cannot change the owner's own role (prevents accidental demotion).
 * - Cannot assign "owner" role (enforced by Zod schema + this function).
 *
 * WHY owner-only (not admin):
 * Role changes are high-impact: promoting someone to admin gives them
 * write access to all content, bots, and catalogs. Demoting removes it.
 * Only the workspace owner should have this power.
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

  // Only owner can change roles (not admin)
  if (callerMembership.role !== "owner") {
    throw new Error("FORBIDDEN");
  }

  // Check the target member exists and get their current role
  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberId)
    .single();

  if (!targetMember) {
    throw new Error("MEMBER_NOT_FOUND");
  }

  // Cannot change the owner's role (safety: prevents accidental demotion)
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
