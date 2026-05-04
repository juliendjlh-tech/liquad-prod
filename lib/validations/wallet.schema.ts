import { z } from "zod";

/**
 * Body schema for POST /api/workspaces/:id/wallets — create a new bot
 * subscription for a subscribed bot. external_user_id is optional; when
 * provided it must be unique within (workspace, bot).
 */
export const createBotSubscriptionSchema = z.object({
  bot_id: z.string().uuid(),
  external_user_id: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(100).optional(),
});

export type CreateBotSubscriptionInput = z.infer<typeof createBotSubscriptionSchema>;

/**
 * Body schema for POST /api/workspaces/:id/wallets/:botSubscriptionId/credits —
 * admin-driven top-up (MVP). Amount is in euros, must be positive.
 */
export const creditBotSubscriptionSchema = z.object({
  amount_eur: z.number().positive().max(100000),
  description: z.string().min(1).max(200).optional(),
});

export type CreditBotSubscriptionInput = z.infer<typeof creditBotSubscriptionSchema>;

/**
 * Body schema for PATCH /api/workspaces/:id/bot-subscriptions/:botSubscriptionId/scope —
 * toggle Option F's per-subscription scope. true = workspace-only (safe
 * default), false = opt-in network access.
 */
export const updateBotSubscriptionScopeSchema = z.object({
  scope_to_workspace: z.boolean(),
});

export type UpdateBotSubscriptionScopeInput = z.infer<typeof updateBotSubscriptionScopeSchema>;
