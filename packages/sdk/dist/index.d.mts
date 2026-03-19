import { I as IdentityCheckRulesConfig, S as SdkEvent, L as LiquadConfig, a as LiquadResult } from './express-BpjGnYL2.mjs';
export { J as JwtPayload, t as toExpressMiddleware } from './express-BpjGnYL2.mjs';
import 'http';

/**
 * Cached rules structure (mirrors SdkRules from the API).
 *
 * This interface represents the workspace rules fetched from
 * GET /api/sdk/rules and cached locally by the SDK. It includes
 * all information needed for the SDK to make local decisions:
 * - Domain verification status
 * - Bot matching patterns
 * - Catalog pricing rules
 * - Identity Check configuration
 */
interface CachedRules {
    workspace_id: string;
    jwt_signing_secret: string;
    verified_domains: string[];
    /** Active user-agents with dns_patterns for Identity Check */
    user_agents: Array<{
        id: string;
        name: string;
        ua_pattern: string;
        /**
         * DNS hostname glob patterns for Identity Check.
         * Example: ["*.openai.com"]
         * Empty array = Identity Check skipped for this bot.
         */
        dns_patterns: string[];
    }>;
    catalogs: Array<{
        id: string;
        name: string;
        url_patterns: string[];
        price_eur: number;
        agent_ids: string[];
    }>;
    /**
     * Identity Check configuration for this workspace.
     *
     * Provides DNS verification timeout/cache settings.
     * IC is always active — per-bot `dns_patterns` controls verification.
     *
     * This field may be absent in rules fetched from older API versions.
     * The SDK uses sensible defaults if missing.
     */
    identity_check?: IdentityCheckRulesConfig;
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
 * The result of a bot identity verification.
 */
interface VerificationResult {
    /** Whether the bot's identity was verified via DNS */
    verified: boolean;
    /** The hostname returned by reverse DNS lookup. Null if rDNS failed. */
    hostname: string | null;
    /** How long the verification took in milliseconds */
    durationMs: number;
    /** Whether this result came from the in-memory cache */
    cached: boolean;
}
/**
 * The public interface of an Identity Checker instance.
 */
interface IdentityChecker {
    /**
     * Verify a bot's identity via DNS.
     *
     * @param ip - The bot's IP address (e.g. "66.249.66.1")
     * @param botId - A unique identifier for the bot (used as cache key)
     * @param dnsPatterns - Expected DNS hostname patterns (e.g. ["*.googlebot.com"])
     * @returns A VerificationResult indicating pass/fail
     */
    verify: (ip: string, botId: string, dnsPatterns: string[]) => Promise<VerificationResult>;
}

/**
 * Liquad SDK — Universal Handler for AI Content Licensing
 *
 * This is the main entry point for the Liquad SDK. It creates a handler
 * that takes a standard Web API Request and returns a LiquadResult.
 * Works identically on Node.js 18+, Cloudflare Workers, and Vercel Edge.
 *
 * ## Pipeline Flow:
 *
 * ```
 * Request arrives
 *   │
 *   ├─ No rules loaded? ──► { blocked: false } (passthrough)
 *   │
 *   ├─ Domain not verified? ──► passthrough
 *   │
 *   ├─ User-agent not matched? ──► passthrough
 *   │
 *   ├─ No matching catalog? ──► { blocked: true, response: 403 }
 *   │
 *   ├─ Price <= defaultPrice ──► "granted" ──┐
 *   │                                        │
 *   └─ Price > defaultPrice ──► JWT check ──►│ "authorized_paid" or 402
 *                                            │
 *                           ┌────────────────┘
 *                           ▼
 *                    Identity Check gate (DoH)
 *                           │
 *                    ├─ No dns_patterns? ──► passthrough + event
 *                    └─ Has dns_patterns ──► DNS verify via DoH
 *                           │
 *                    ├─ Verified ──► passthrough + event with IC metadata
 *                    └─ Unverified ──► { blocked: true, response: 403 }
 * ```
 *
 * @module liquad-sdk
 */

/**
 * Create a Liquad handler that processes incoming requests
 * and applies AI content licensing rules.
 *
 * Usage:
 *   const handler = createLiquadHandler({ apiKey: 'lq_...' });
 *   const result = await handler(request);
 *   if (result.blocked) return result.response;
 *
 * @param config - SDK configuration
 * @returns An async function: Request → LiquadResult
 * @throws Error only if apiKey is missing (at creation time, not at runtime)
 */
declare function createLiquadHandler(config: LiquadConfig): (request: Request) => Promise<LiquadResult>;

export { type CachedRules, type IdentityChecker, LiquadConfig, LiquadResult, type MatchDecision, SdkEvent, type VerificationResult, createLiquadHandler };
