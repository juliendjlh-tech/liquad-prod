import { IncomingMessage, ServerResponse } from 'http';

/**
 * JWT payload claims for access tokens.
 * Signed by publisher's jwt_signing_secret, verified locally by SDK.
 */
interface JwtPayload {
    sub: string;
    pub: string;
    url: string;
    cat: string;
    amt: number;
    exp: number;
    iat: number;
    jti: string;
}
/**
 * Configuration for the Liquad SDK middleware.
 */
interface LiquadConfig {
    /** Required: workspace API key (starts with "lq_") */
    apiKey: string;
    /** Default price threshold in EUR. Default: 0 */
    defaultPrice?: number;
    /** Interval in ms to refresh rules from API. Default: 300000 (5 min) */
    refreshInterval?: number;
    /** Max events in buffer before sending batch. Default: 100 */
    batchSize?: number;
    /** Interval in ms to flush event buffer. Default: 30000 (30s) */
    batchInterval?: number;
    /** Optional error handler. Errors are never thrown to avoid crashing the host server. */
    onError?: (error: Error) => void;
    /** Liquad API base URL. Default: "https://liquad.app" */
    apiBaseUrl?: string;
}
/**
 * Express/Connect-compatible middleware signature.
 */
type LiquadMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/**
 * Cached rules structure (mirrors SdkRules from the API).
 */
interface CachedRules {
    workspace_id: string;
    jwt_signing_secret: string;
    verified_domains: string[];
    user_agents: Array<{
        id: string;
        name: string;
        ua_pattern: string;
    }>;
    catalogs: Array<{
        id: string;
        name: string;
        url_patterns: string[];
        price_eur: number;
        agent_ids: string[];
    }>;
}

/**
 * An SDK event to be sent to the Liquad API.
 */
interface SdkEvent {
    domain: string;
    request_url: string;
    user_agent_name: string | null;
    user_agent_raw: string | null;
    matched_catalog_id: string | null;
    decision: "granted" | "denied" | "blocked_no_catalog" | "authorized_paid" | "denied_authorization_required" | "denied_invalid_token";
    price_applied: number | null;
    consumer_workspace_id: string | null;
    timestamp: string;
}

/**
 * Decision result from the matcher.
 */
type MatchDecision = {
    type: "passthrough";
} | {
    type: "granted";
    catalogId: string;
    price: number;
    event: SdkEvent;
} | {
    type: "denied";
    catalogId: string;
    price: number;
    responseBody: object;
    event: SdkEvent;
} | {
    type: "blocked_no_catalog";
    event: SdkEvent;
};

/**
 * Create a Liquad middleware that intercepts incoming requests
 * and applies AI content licensing rules.
 *
 * Usage:
 *   const middleware = createLiquadMiddleware({ apiKey: 'lq_...' });
 *   app.use(middleware); // Express
 *
 * The middleware:
 * 1. On startup: fetches rules from GET /api/sdk/rules (cached, refreshed periodically)
 * 2. On each request: checks if the user-agent matches a declared bot
 * 3. If undeclared bot or non-bot: calls next() immediately (free access)
 * 4. If declared bot: applies catalog matching logic
 * 5. For paid content (price > defaultPrice):
 *    a. Checks for Authorization: License <JWT> header
 *    b. If valid JWT: serves content (authorized_paid event)
 *    c. If no JWT or invalid: returns 402 with authorize_url instructions
 * 6. Buffers access events and sends them in batches to POST /api/sdk/events
 *
 * CRITICAL: The middleware NEVER throws errors. All errors are caught and
 * passed to onError callback. The host server must never crash due to the SDK.
 *
 * @param config - SDK configuration
 * @returns Express/Connect-compatible middleware function
 * @throws Error only if apiKey is missing (at creation time, not at runtime)
 */
declare function createLiquadMiddleware(config: LiquadConfig): LiquadMiddleware;

export { type CachedRules, type JwtPayload, type LiquadConfig, type LiquadMiddleware, type MatchDecision, type SdkEvent, createLiquadMiddleware };
