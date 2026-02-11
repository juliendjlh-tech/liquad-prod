import { z } from "zod";

/**
 * Schema for a single SDK event.
 *
 * Validates event data sent by the deployed SDK:
 * - domain: Required, non-empty hostname.
 * - request_url: Required, valid URL.
 * - user_agent_name: Optional, the matched bot name.
 * - user_agent_raw: Optional, the raw User-Agent header.
 * - matched_catalog_id: Optional UUID of the catalog that matched.
 * - decision: Required, one of "granted", "denied", "blocked_no_catalog".
 * - price_applied: Optional price from the matched catalog.
 * - timestamp: Required, ISO 8601 datetime string.
 */
export const sdkEventSchema = z.object({
  domain: z.string().min(1),
  request_url: z.url(),
  user_agent_name: z.string().nullable().optional(),
  user_agent_raw: z.string().nullable().optional(),
  matched_catalog_id: z.string().uuid().nullable().optional(),
  decision: z.enum(["granted", "denied", "blocked_no_catalog"]),
  price_applied: z.number().min(0).max(1).nullable().optional(),
  timestamp: z.string().datetime(),
});

export type SdkEventInput = z.infer<typeof sdkEventSchema>;

/**
 * Schema for POST /api/sdk/events batch request body.
 * - events: Array of SDK events, max 1000 per batch.
 *
 * Used by:
 * - `app/api/sdk/events/route.ts` — POST handler
 */
export const sdkEventBatchSchema = z.object({
  events: z
    .array(sdkEventSchema)
    .max(1000, "Batch size exceeds maximum of 1000 events"),
});

export type SdkEventBatchInput = z.infer<typeof sdkEventBatchSchema>;
