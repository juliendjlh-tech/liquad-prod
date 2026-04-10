// ---------------------------------------------------------------------------
// Workspace API Key service
//
// Handles API key generation, hashing (scrypt), verification, and rotation.
// Extracted from workspace.service.ts to isolate crypto operations and
// eliminate cross-dependency with sdk-auth.service.
// ---------------------------------------------------------------------------

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
// Key Generation & Hashing
// ---------------------------------------------------------------------------

/**
 * Generate a random API key with prefix "lq_".
 *
 * Format: `lq_` + 40 random alphanumeric characters (base64url).
 * Total length: 43 characters.
 *
 * The "lq_" prefix makes Liquad API keys visually identifiable
 * in configuration files and logs (similar to Stripe's "sk_" prefix).
 *
 * Uses Node.js built-in `crypto.randomBytes()` for cryptographically
 * secure random generation — no external dependencies needed.
 *
 * @returns The plaintext API key (e.g., "lq_a1b2c3d4e5f6...")
 */
export function generateApiKey(): string {
  // 30 random bytes → base64url → take first 40 chars.
  // 240 bits of entropy, far above the 128-bit minimum for API keys.
  const randomPart = randomBytes(30).toString("base64url").slice(0, 40);
  return `lq_${randomPart}`;
}

/**
 * Hash an API key using scrypt for secure storage.
 *
 * Output format: `<salt_hex>:<hash_hex>`
 * - salt: 16 random bytes (128 bits) to prevent rainbow table attacks
 * - hash: 64-byte scrypt output
 *
 * @param apiKey - The plaintext API key to hash
 * @returns The hash string in format "salt:hash" (both hex-encoded)
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
// Key Rotation
// ---------------------------------------------------------------------------

/**
 * Regenerate the API key for a workspace.
 * Only the workspace owner can perform this action.
 *
 * The old key is IMMEDIATELY invalidated because the hash is overwritten.
 * Any SDK using the old key will receive 401 on its next request.
 *
 * @param workspaceId - The workspace UUID
 * @param userId - The authenticated user's UUID
 * @returns The new plaintext API key (shown once, never again)
 * @throws Error with "NOT_MEMBER" if user is not a member
 * @throws Error with "FORBIDDEN" if user is not the owner
 */
export async function regenerateApiKey(
  workspaceId: string,
  userId: string
): Promise<string> {
  const supabase = await createServerClient();

  // Verify membership and owner role
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

  // Generate and hash new key
  const newApiKey = generateApiKey();
  const newHash = await hashApiKey(newApiKey);

  // Overwrite the old hash — immediate invalidation
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
