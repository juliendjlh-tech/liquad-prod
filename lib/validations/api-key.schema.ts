import { z } from "zod";

/**
 * Body schema for POST /api/internal/workspaces/:id/api-keys.
 *
 * Since migration 041 the key is an immutable triple (subscription, network,
 * bot). All three must be passed at creation time. The trigger
 * validate_api_key_bot_in_network enforces bot ∈ derived(network).
 */
export const createApiKeySchema = z.object({
  label: z.string().min(1).max(100).optional(),
  subscription_id: z.string().uuid(),
  network_id: z.string().uuid(),
  bot_id: z.string().uuid(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
