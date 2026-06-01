import { z } from "zod";

/**
 * Body schemas for /api/internal/workspaces/:id/access-settings routes.
 *
 * An access settings is a consumer plan: a bot + a list of catalogues + a
 * max_price_eur ceiling. It replaces the legacy network (publisher-owned) and
 * search_config (RAG-only) concepts.
 */

export const createAccessSettingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** Bot the plan is built around. If not already in workspace_bots, the
   * service auto-subscribes. */
  bot_id: z.string().uuid(),
  /** Max price (EUR) per grant. NULL or omitted = no cap. */
  max_price_eur: z.number().min(0).max(1).nullable().optional(),
  /** Catalogues to bundle. Each must be marketplace-active OR belong to the
   * same workspace as the plan. Eligibility is double-enforced by the
   * BEFORE INSERT trigger on access_settings_catalogs. */
  catalog_ids: z.array(z.string().uuid()).min(1).max(100),
});

export type CreateAccessSettingsInput = z.infer<typeof createAccessSettingsSchema>;

export const updateAccessSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    /** Pass `null` to remove the cap. */
    max_price_eur: z.number().min(0).max(1).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.max_price_eur !== undefined, {
    message: "At least one field is required",
  });

export type UpdateAccessSettingsInput = z.infer<typeof updateAccessSettingsSchema>;

export const addCatalogsSchema = z.object({
  catalog_ids: z.array(z.string().uuid()).min(1).max(100),
});

export type AddCatalogsInput = z.infer<typeof addCatalogsSchema>;
