import { z } from "zod";

/**
 * Body schema for POST /api/workspaces/:id/wallets — create a new wallet
 * for a subscribed bot. external_user_id is optional; when provided it must
 * be unique within (workspace, agent).
 */
export const createWalletSchema = z.object({
  agent_id: z.string().uuid(),
  external_user_id: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(100).optional(),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;

/**
 * Body schema for POST /api/workspaces/:id/wallets/:walletId/credits —
 * admin-driven top-up (MVP). Amount is in euros, must be positive.
 */
export const creditWalletSchema = z.object({
  amount_eur: z.number().positive().max(100000),
  description: z.string().min(1).max(200).optional(),
});

export type CreditWalletInput = z.infer<typeof creditWalletSchema>;
