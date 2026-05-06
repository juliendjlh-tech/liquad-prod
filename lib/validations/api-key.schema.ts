import { z } from "zod";

/**
 * Body schema for POST /api/workspaces/:id/api-keys.
 *
 * Keys are workspace+subscription scoped (since migration 032). Bot identity
 * is provided per /licenses call.
 */
export const createApiKeySchema = z.object({
  label: z.string().min(1).max(100).optional(),
  /**
   * Attach the new key to an existing subscription. When omitted, a new
   * subscription is created implicitly and `mode` is required.
   */
  subscription_id: z.string().uuid().optional(),
  /**
   * Required when subscription_id is omitted: decides whether the implicitly
   * created subscription is publisher-scoped (workspace catalogs only) or
   * access-scoped (network access).
   */
  mode: z.enum(["publisher", "access"]).optional(),
  /** Label for the implicit subscription (ignored when subscription_id is provided). */
  subscription_label: z.string().min(1).max(100).optional(),
  /** external_user_id for the implicit subscription (publisher mode only). */
  subscription_external_user_id: z.string().min(1).max(200).optional(),
  /**
   * Optional default bot used as fallback when /licenses body omits bot_id.
   * Must belong to the calling workspace's workspace_bots.
   */
  default_bot_id: z.string().uuid().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
