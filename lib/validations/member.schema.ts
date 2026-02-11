import { z } from "zod";

/**
 * Schema for POST /api/workspaces/:id/members request body.
 *
 * Validates member invitation input:
 * - email: Required, must be a valid email format.
 * - role: Optional, defaults to "member". Must be "admin" or "member".
 *   The "owner" role CANNOT be assigned via invite — it is set only
 *   at workspace creation (one owner per workspace).
 *
 * WHY role is optional with default "member":
 * Most invites will be for regular members. Requiring the role field
 * every time adds friction. Defaulting to "member" (least privilege)
 * follows the principle of least surprise.
 *
 * Used by:
 * - `app/api/workspaces/[id]/members/route.ts` — POST invite handler
 *
 * @example
 * ```typescript
 * // Invite as admin
 * inviteMemberSchema.parse({ email: "admin@co.com", role: "admin" });
 *
 * // Invite with default role (member)
 * inviteMemberSchema.parse({ email: "viewer@co.com" });
 * // → { email: "viewer@co.com", role: "member" }
 * ```
 */
export const inviteMemberSchema = z.object({
  email: z.email("Invalid email format"),
  role: z
    .enum(["admin", "member"], {
      error: "role must be 'admin' or 'member'",
    })
    .optional()
    .default("member"),
});

/**
 * TypeScript type inferred from inviteMemberSchema.
 */
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * Schema for PATCH /api/workspaces/:id/members/:memberId request body.
 *
 * Validates role change input:
 * - role: Required. Must be "admin" or "member".
 *   "owner" cannot be assigned — there is exactly one owner per workspace.
 *
 * Used by:
 * - `app/api/workspaces/[id]/members/[memberId]/route.ts` — PATCH handler
 */
export const changeMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"], {
    error: "Cannot assign owner role",
  }),
});

/**
 * TypeScript type inferred from changeMemberRoleSchema.
 */
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
