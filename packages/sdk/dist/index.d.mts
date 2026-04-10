import { L as LiquadConfig, a as LiquadResult } from './express-B3hRx0o3.mjs';
export { C as CatalogFilterRules, D as DomainRule, F as FilterRule, S as SdkEvent, t as toExpressMiddleware } from './express-B3hRx0o3.mjs';
import { MatchableCatalog } from './matcher.mjs';
export { MatchRequestInput, MatchResult, MatchableAgent, matchRequest, matchUserAgent } from './matcher.mjs';
export { normalizeUrl } from './url-normalize.mjs';
import 'http';

/**
 * Cached rules structure (mirrors WorkspaceRules from the API).
 *
 * Contains everything the SDK needs for local decisions:
 * - HMAC secret for token verification
 * - Bot matching patterns with default behavior
 * - Identity Check IP ranges
 * - Free catalogs (price_eur=0) for local URL matching
 */
interface CachedRules {
    workspace_id: string;
    /** Publisher's HMAC signing secret for local token verification */
    hmac_secret: string;
    verified_domains: string[];
    agents: Array<{
        id: string;
        name: string;
        ua_pattern: string;
        /** Official IP ranges (CIDR) declared by the bot operator */
        declared_ips: string[];
        /** Catalog IDs this agent is linked to */
        catalog_ids: string[];
    }>;
    /** Free catalogs (price_eur=0) with resolved filter_rules for local matching */
    catalogs: MatchableCatalog[];
}

/**
 * HMAC Token Verification — local, zero-network verification
 *
 * Verifies HMAC-SHA256 signed tokens using Web Crypto API.
 * Works on Node 18+, Cloudflare Workers, Deno, Vercel Edge.
 *
 * Token format: base64url( grantId.expiryUnix.hmacSignatureHex )
 * HMAC message: grantId + "." + normalizedUrl + "." + expiryUnix
 *
 * The URL is NOT in the token — reconstructed from the request.
 * This binds each token to a specific URL (prevents cross-URL reuse).
 */
interface TokenVerifyResult {
    valid: boolean;
    grantId?: string;
}
/**
 * Verify an HMAC-signed access token.
 *
 * @param token         - Base64url-encoded token from ?_lq= param or Authorization header
 * @param normalizedUrl - The normalized URL being requested (used to reconstruct HMAC message)
 * @param secret        - Publisher's HMAC secret (base64-encoded, from workspace rules)
 * @param nowMs         - Current time in ms (optional, for testing)
 */
declare function verifyToken(token: string, normalizedUrl: string, secret: string, nowMs?: number): Promise<TokenVerifyResult>;

/**
 * Liquad SDK — Universal Handler for AI Content Licensing
 *
 * @module liquad-sdk
 *
 * handleRequest flow:
 *
 *   1. Load cached workspace rules (agents + free catalogs + HMAC secret)
 *   2. Extract User-Agent → match against known agents (matchUserAgent)
 *      └── No match → pass through (unknown bot / human) — FAST PATH
 *   3. Extract client IP
 *      └── Declared ranges exist + IP missing or not in ranges → 403 (spoofed UA)
 *   4. Normalize request URL
 *   4a. Match URL against free catalogs (price_eur=0) for this agent
 *      └── Match → pass through (decision: "granted", no token needed)
 *   5. Extract token from ?_lq= param or Authorization: License header
 *      └── Token present → verify HMAC locally (0.1ms, no API call)
 *          └── Valid   → pass through
 *          └── Invalid → 403
 *      └── No token → 403 + authorize_url (opt_out)
 *   6. Events buffered and flushed in batches (5s interval or 50 events)
 */

declare function createLiquadHandler(config: LiquadConfig): (request: Request) => Promise<LiquadResult>;

export { type CachedRules, LiquadConfig, LiquadResult, MatchableCatalog, type TokenVerifyResult, createLiquadHandler, verifyToken };
