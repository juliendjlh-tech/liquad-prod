import { z } from "zod";

/**
 * Body schema for POST /api/workspaces/:id/api-keys.
 *
 * ADR-006. Each consumer API key is bound to an agent (bot) of the caller's
 * workspace. The workspace that owns the key is always the paying workspace.
 */
export const createApiKeySchema = z.object({
  agent_id: z.string().uuid(),
  label: z.string().min(1).max(100).optional(),
  /**
   * Attach the new key to an existing wallet. When omitted, a new wallet is
   * created implicitly (one-wallet-per-new-key default).
   */
  wallet_id: z.string().uuid().optional(),
  /** Label for the implicit wallet (ignored when wallet_id is provided). */
  wallet_label: z.string().min(1).max(100).optional(),
  /** external_user_id for the implicit wallet (ignored when wallet_id is provided). */
  wallet_external_user_id: z.string().min(1).max(200).optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
