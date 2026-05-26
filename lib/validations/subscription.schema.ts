import { z } from "zod";

/**
 * Body schema for POST /api/internal/workspaces/:id/subscriptions.
 *
 * Since migration 041, subscriptions are pure wallets. No mode, no scope, no
 * catalog allowlist, no price cap. Catalogue scope is driven by the API key's
 * network, not the subscription.
 */
export const createSubscriptionSchema = z.object({
  external_user_id: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(100).optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

/**
 * Body schema for PATCH /api/internal/workspaces/:id/subscriptions/:subscriptionId.
 */
export const updateSubscriptionSchema = z
  .object({
    label: z.string().min(1).max(100).nullable().optional(),
    external_user_id: z.string().min(1).max(200).nullable().optional(),
  })
  .refine(
    (v) => v.label !== undefined || v.external_user_id !== undefined,
    { message: "At least one field is required" }
  );

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

/**
 * Body schema for POST /api/internal/workspaces/:id/subscriptions/:subscriptionId/credits.
 */
export const creditSubscriptionSchema = z.object({
  amount_eur: z.number().positive().max(100000),
  description: z.string().min(1).max(200).optional(),
});

export type CreditSubscriptionInput = z.infer<typeof creditSubscriptionSchema>;
