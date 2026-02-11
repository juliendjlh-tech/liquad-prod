import { z } from "zod";

/**
 * Schema for POST /api/user-agents request body.
 *
 * Validates user-agent creation input:
 * - name: Required, non-empty, trimmed, max 100 chars.
 * - ua_pattern: Required, non-empty, max 500 chars.
 * - is_preset: Optional boolean (default false).
 *
 * Used by:
 * - `app/api/user-agents/route.ts` — POST create handler
 */
export const createUserAgentSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  ua_pattern: z.string().trim().min(1, "ua_pattern is required").max(500),
  is_preset: z.boolean().optional().default(false),
});

export type CreateUserAgentInput = z.infer<typeof createUserAgentSchema>;

/**
 * Schema for PATCH /api/user-agents/:id request body.
 *
 * All fields optional — partial update.
 * Includes is_active for toggle support (US-004-002).
 *
 * Used by:
 * - `app/api/user-agents/[id]/route.ts` — PATCH update handler
 */
export const updateUserAgentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  ua_pattern: z.string().trim().min(1).max(500).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateUserAgentInput = z.infer<typeof updateUserAgentSchema>;
