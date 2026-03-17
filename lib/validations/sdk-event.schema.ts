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
 * - decision: Required, one of the allowed decision values.
 * - price_applied: Optional price from the matched catalog.
 * - consumer_workspace_id: Optional UUID of the consuming workspace (for paid access).
 * - timestamp: Required, ISO 8601 datetime string.
 *
 * Identity Check metadata (added by US-IC-07):
 * - source_ip: Optional, the bot's IP address used for IC verification.
 * - ic_verified: Optional, whether the bot passed Identity Check.
 * - ic_hostname: Optional, the rDNS hostname found during IC verification.
 * - ic_duration_ms: Optional, how long the IC verification took (in ms).
 *
 * These IC fields are only present when Identity Check is enabled for the
 * workspace AND the bot has dns_patterns configured. Events from older SDK
 * versions (without IC support) will not include these fields — they remain
 * nullable for backward compatibility.
 *
 * @see US-IC-04 for the SDK pipeline that generates these events
 * @see US-IC-07 for the dashboard analytics that consume these events
 */
export const sdkEventSchema = z.object({
  domain: z.string().min(1),
  request_url: z.url(),
  user_agent_name: z.string().nullable().optional(),
  user_agent_raw: z.string().nullable().optional(),
  matched_catalog_id: z.string().uuid().nullable().optional(),

  /**
   * The SDK's access decision for this request.
   *
   * Values:
   * - "granted": Bot matched, catalog matched, free access served
   * - "denied": Bot matched but no catalog matched → access denied
   * - "blocked_no_catalog": Bot matched but URL has no matching catalog
   * - "authorized_paid": Bot matched, catalog matched, paid access via JWT
   * - "denied_authorization_required": Paid catalog but no valid JWT
   * - "denied_invalid_token": JWT present but invalid/expired
   * - "denied_identity_check": Bot matched, IC enabled, DNS verification FAILED
   *    (added by US-IC-01 migration, used by US-IC-04 SDK pipeline)
   */
  decision: z.enum([
    "granted",
    "denied",
    "blocked_no_catalog",
    "authorized_paid",
    "denied_authorization_required",
    "denied_invalid_token",
    "denied_identity_check",
  ]),

  price_applied: z.number().min(0).nullable().optional(),
  consumer_workspace_id: z.string().uuid().nullable().optional(),
  timestamp: z.string().datetime(),

  // ---------------------------------------------------------------------------
  // Identity Check Metadata (US-IC-07)
  // ---------------------------------------------------------------------------
  // These fields are optional and nullable to maintain backward compatibility.
  // Older SDKs that don't know about IC will simply omit them.

  /**
   * The bot's IP address used for Identity Check verification.
   * Extracted from `req.socket.remoteAddress` in the SDK middleware.
   * IPv4-mapped IPv6 prefix (::ffff:) is stripped before storing.
   * Example: "66.249.66.1"
   */
  source_ip: z.string().nullable().optional(),

  /**
   * Whether the bot passed Identity Check DNS verification.
   * true = verified (rDNS + pattern match + fDNS all passed)
   * false = unverified (any step failed)
   * null/undefined = IC was not performed (disabled or no dns_patterns)
   */
  ic_verified: z.boolean().nullable().optional(),

  /**
   * The hostname returned by reverse DNS lookup during IC verification.
   * Example: "crawl-66-249-66-1.googlebot.com"
   * null if rDNS failed/timed out or IC was not performed.
   */
  ic_hostname: z.string().nullable().optional(),

  /**
   * How long the Identity Check verification took in milliseconds.
   * Includes both rDNS and fDNS lookups (or cache hit time).
   * Useful for monitoring DNS latency impact on request handling.
   */
  ic_duration_ms: z.number().int().min(0).nullable().optional(),
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
