/**
 * JWT payload claims for access tokens.
 * Signed by publisher's jwt_signing_secret, verified locally by SDK.
 */
export interface JwtPayload {
  sub: string; // consumer_workspace_id
  pub: string; // publisher_workspace_id
  url: string; // normalized content URL
  cat: string; // catalog_id
  amt: number; // price EUR
  exp: number; // expiration timestamp
  iat: number; // issued at
  jti: string; // grant_id
}

/**
 * Configuration for the Liquad SDK.
 */
export interface LiquadConfig {
  /** Required: workspace API key (starts with "lq_") */
  apiKey: string;

  /** Default price threshold in EUR. Default: 0 */
  defaultPrice?: number;

  /** Interval in ms to consider cached rules fresh. Default: 300000 (5 min) */
  refreshInterval?: number;

  /** Optional error handler. Errors are never thrown to avoid crashing the host. */
  onError?: (error: Error) => void;

  /** Liquad API base URL. Default: "https://liquad.app" */
  apiBaseUrl?: string;

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
// Filter Rules Types (structured matching, no regex)
// ---------------------------------------------------------------------------

/**
 * A single path rule with an operator and value.
 */
export interface FilterRule {
  operator:
    | "contains"
    | "not_contains"
    | "starts_with"
    | "not_starts_with"
    | "equals"
    | "ends_with";
  value: string;
}

/**
 * A domain-level rule with optional path filtering.
 */
export interface DomainRule {
  /** Hostname (e.g. "example.com") — resolved from domain_id by the server */
  domain: string;
  path_rules?: FilterRule[];
  path_logic?: "AND" | "OR";
}

/**
 * Structured filter rules for a catalog.
 * Replaces regex-based url_patterns.
 */
export interface CatalogFilterRules {
  domain_rules: DomainRule[];
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

// ---------------------------------------------------------------------------
// Identity Check Types (used by rules-cache and identity-check modules)
// ---------------------------------------------------------------------------

/**
 * Identity Check configuration received from the server as part of workspace rules.
 *
 * Provides recommended settings for DNS verification behavior.
 * IC is always active — the per-bot `dns_patterns` array controls whether
 * a specific bot is verified (empty array = IC skipped for that bot).
 */
export interface IdentityCheckRulesConfig {
  /**
   * How long to cache DNS verification results (in milliseconds).
   * Default from server: 3,600,000 (1 hour).
   */
  cache_ttl_ms: number;

  /**
   * Maximum time to wait for a DNS lookup (in milliseconds).
   * Default from server: 500.
   */
  dns_timeout_ms: number;
}
