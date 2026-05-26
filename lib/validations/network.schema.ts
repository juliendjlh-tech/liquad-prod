import { z } from "zod";

/**
 * Validation schemas for /api/internal/workspaces/:id/networks routes and
 * the catalogue-side invite responses.
 */

export const createNetworkSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500).nullable().optional(),
});

export type CreateNetworkInput = z.infer<typeof createNetworkSchema>;

export const updateNetworkSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().min(1).max(500).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: "At least one field is required",
  });

export type UpdateNetworkInput = z.infer<typeof updateNetworkSchema>;

/**
 * Body for POST /api/internal/workspaces/:ws/networks/:networkId/invites.
 * Catalogues are referenced by their internal UUID (validated server-side
 * against marketplace status).
 */
export const inviteNetworkCatalogsSchema = z.object({
  catalog_ids: z.array(z.string().uuid()).min(1).max(100),
});

export type InviteNetworkCatalogsInput = z.infer<typeof inviteNetworkCatalogsSchema>;

/**
 * Body for PATCH /api/internal/workspaces/:ws/catalogs/:catalogId/network-invites/:networkId.
 * The catalogue's workspace either accepts or revokes the invite.
 */
export const respondToNetworkInviteSchema = z.object({
  action: z.enum(["accept", "revoke"]),
});

export type RespondToNetworkInviteInput = z.infer<typeof respondToNetworkInviteSchema>;
