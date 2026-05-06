import { z } from "zod";

/**
 * Body schema for POST /api/workspaces/:id/subscriptions —
 * create a new workspace-scoped subscription. The `mode` decides
 * scope_to_workspace deterministically and is immutable thereafter.
 */
export const createSubscriptionSchema = z.object({
  mode: z.enum(["publisher", "access"]),
  external_user_id: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(100).optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

/**
 * Body schema for POST /api/workspaces/:id/subscriptions/:subscriptionId/credits —
 * admin-driven top-up (MVP).
 */
export const creditSubscriptionSchema = z.object({
  amount_eur: z.number().positive().max(100000),
  description: z.string().min(1).max(200).optional(),
});

export type CreditSubscriptionInput = z.infer<typeof creditSubscriptionSchema>;
