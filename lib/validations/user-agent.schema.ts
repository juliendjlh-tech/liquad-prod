import { z } from "zod";

// ---------------------------------------------------------------------------
// Create Schema — add an agent to a workspace
// ---------------------------------------------------------------------------

export const createUserAgentSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  ua_pattern: z.string().trim().min(1, "ua_pattern is required").max(500),
  declared_ips: z.array(z.string().trim().min(1)).optional().default([]),
});

export type CreateUserAgentInput = z.infer<typeof createUserAgentSchema>;

// ---------------------------------------------------------------------------
// Update Schema — partial update of an agent
// ---------------------------------------------------------------------------

export const updateUserAgentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  ua_pattern: z.string().trim().min(1).max(500).optional(),
  declared_ips: z.array(z.string().trim().min(1)).optional(),
});

export type UpdateUserAgentInput = z.infer<typeof updateUserAgentSchema>;
