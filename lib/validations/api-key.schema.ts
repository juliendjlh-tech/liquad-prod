import { z } from "zod";

/**
 * Body schema for POST /api/internal/workspaces/:id/api-keys.
 *
 * Since migration 045 the key is a pair (subscription, access_settings). The
 * bot identity is carried by access_settings; the DB trigger
 * `trg_api_keys_validate_bot_matches_access_settings` enforces equality on
 * the denormalized `bot_id` column.
 */
export const createApiKeySchema = z.object({
  label: z.string().min(1).max(100).optional(),
  subscription_id: z.string().uuid(),
  access_settings_id: z.string().uuid(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
