import { z } from "zod";

/**
 * Body schema for POST /api/workspaces/:id/api-keys.
 *
 * ADR-006. Each consumer API key is bound to a bot of the caller's
 * workspace. The workspace that owns the key is always the paying workspace.
 */
export const createApiKeySchema = z.object({
  bot_id: z.string().uuid(),
  label: z.string().min(1).max(100).optional(),
  /**
   * Attach the new key to an existing bot subscription. When omitted, a new
   * subscription is created implicitly (one-subscription-per-new-key default).
   */
  bot_subscription_id: z.string().uuid().optional(),
  /** Label for the implicit bot subscription (ignored when bot_subscription_id is provided). */
  bot_subscription_label: z.string().min(1).max(100).optional(),
  /** external_user_id for the implicit bot subscription (ignored when bot_subscription_id is provided). */
  bot_subscription_external_user_id: z.string().min(1).max(200).optional(),
  /** When true, the new subscription gets network access (scope_to_workspace=false). Default: false (workspace-only). */
  bot_subscription_network_access: z.boolean().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
