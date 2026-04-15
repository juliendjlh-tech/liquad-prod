/**
 * Configuration for the Liquad SDK.
 */
export interface LiquadConfig {
  /** Required: workspace API key (starts with "lq_") */
  apiKey: string;

  /** Interval in ms to consider cached rules fresh. Default: 300000 (5 min) */
  refreshInterval?: number;

  /** Optional error handler. Errors are never thrown to avoid crashing the host. */
  onError?: (error: Error) => void;

  /** Liquad API base URL. Default: "https://liquad.app" */
  apiBaseUrl?: string;
}

/**
 * Per-request options passed to the handler.
 *
 * Separated from LiquadConfig so the handler can be created once (singleton)
 * while per-request context (like Cloudflare's ctx.waitUntil) is passed at
 * call time.
 */
export interface HandleRequestOptions {
  /**
   * Edge runtime helper to run async tasks after the response is sent.
   * Pass `ctx.waitUntil.bind(ctx)` in Cloudflare Workers.
   * If omitted, async tasks are fire-and-forget (fine in Node.js long-lived processes).
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * Result returned by the Liquad handler.
 */
export interface LiquadResult {
  /** Whether the request was blocked (true = bot denied, response is set) */
  blocked: boolean;

  /** The HTTP response to send back (present when blocked is true) */
  response?: Response;
}

// ---------------------------------------------------------------------------
// SDK Event Types
// ---------------------------------------------------------------------------

/**
 * An SDK event to be sent to the Liquad API.
 *
 * Each event represents a single request processed by the SDK handler.
 * Events are sent individually after each request.
 *
 * The Identity Check (IC) metadata fields are optional — they are only
 * populated when IC is enabled and a DNS verification was performed.
 */
export interface SdkEvent {
  domain: string;
  request_url: string;
  user_agent_name: string | null;
  user_agent_raw: string | null;
  matched_catalog_id: string | null;
  decision:
    | "granted"
    | "denied"
    | "blocked_no_catalog"
    | "authorized_paid"
    | "denied_authorization_required"
    | "denied_invalid_token"
    | "denied_identity_check";
  price_applied: number | null;
  consumer_workspace_id: string | null;
  timestamp: string; // ISO 8601

  // --- Identity Check metadata (optional) ---

  /** Bot's IP address. Null if IC not performed. */
  source_ip?: string | null;

  /** Whether the bot passed DNS verification. Null/undefined if IC not performed. */
  ic_verified?: boolean | null;

  /** Hostname from rDNS lookup. Null if rDNS failed or IC not performed. */
  ic_hostname?: string | null;

  /** DNS verification duration in milliseconds. Null if IC not performed. */
  ic_duration_ms?: number | null;
}

