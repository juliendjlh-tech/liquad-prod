import { z } from "zod";
import { publicId } from "@/lib/validations/ids";

/**
 * Body schema for POST /api/workspaces/:id/gateways — create a gateway.
 */
export const createGatewaySchema = z.object({
  label: z.string().min(1).max(100).nullable().optional(),
  catalog_ids: z.array(publicId("cat")).max(200).optional(),
});

export type CreateGatewayInput = z.infer<typeof createGatewaySchema>;

/**
 * Body schema for PATCH /api/workspaces/:id/gateways/:gatewayId.
 */
export const updateGatewaySchema = z
  .object({
    label: z.string().min(1).max(100).nullable().optional(),
    catalog_ids: z.array(publicId("cat")).max(200).optional(),
  })
  .refine(
    (v) => v.label !== undefined || v.catalog_ids !== undefined,
    { message: "At least one field is required" }
  );

export type UpdateGatewayInput = z.infer<typeof updateGatewaySchema>;
