import { z } from "zod";

/**
 * Body schema for POST /api/internal/workspaces/:id/subscriptions.
 *
 * Subscriptions are pure wallets — no mode, no scope, no catalog allowlist,
 * no price cap. The catalogue scope + max_price live on the API key's
 * access_settings, not the subscription.
 */
export const createSubscriptionSchema = z.object({
  external_user_id: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(100).optional(),
  monthly_cap_eur: z.number().nonnegative().max(1_000_000).nullable().optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

/**
 * Body schema for PATCH /api/internal/workspaces/:id/subscriptions/:subscriptionId.
 */
export const updateSubscriptionSchema = z
  .object({
    label: z.string().min(1).max(100).nullable().optional(),
    external_user_id: z.string().min(1).max(200).nullable().optional(),
    monthly_cap_eur: z.number().nonnegative().max(1_000_000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.label !== undefined ||
      v.external_user_id !== undefined ||
      v.monthly_cap_eur !== undefined,
    { message: "At least one field is required" }
  );

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

/**
 * Body schema for POST /api/internal/workspaces/:id/credits (admin top-up).
 * Top-ups operate at the workspace wallet level since migration 047.
 */
export const creditWorkspaceSchema = z.object({
  amount_eur: z.number().positive().max(100000),
  description: z.string().min(1).max(200).optional(),
});

export type CreditWorkspaceInput = z.infer<typeof creditWorkspaceSchema>;
