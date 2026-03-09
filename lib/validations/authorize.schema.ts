import { z } from "zod";

/**
 * Schema for POST /api/sdk/authorize request body.
 *
 * - url: Required, valid HTTP(S) URL of the content to access.
 * - max_price_eur: Optional price ceiling. If the catalog price exceeds
 *   this value, the request is rejected without debiting.
 *
 * Used by:
 * - `app/api/sdk/authorize/route.ts` — POST handler
 * - `lib/services/authorize.service.ts` — service layer
 */
export const authorizeSchema = z.object({
  url: z.url(),
  max_price_eur: z.number().min(0).max(100).optional(),
});

export type AuthorizeInput = z.infer<typeof authorizeSchema>;
