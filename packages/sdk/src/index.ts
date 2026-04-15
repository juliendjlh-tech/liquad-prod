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

import type { LiquadConfig, LiquadResult, SdkEvent, HandleRequestOptions } from "./types";
import { createRulesCache } from "./rules-cache";
import { matchUserAgent, findBestCatalog } from "./matcher";
import { isIpInRanges } from "./ip-check";
import { normalizeUrl } from "./url-normalize";
import { verifyToken } from "./token-verify";
import { createEventBuffer } from "./event-buffer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Extract the client IP from the request.
 * Prefers Cloudflare's header, then falls back to X-Forwarded-For (first hop).
 */
function extractSourceIp(request: Request): string | null {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  return null;
}

/**
 * Extract access token from the request.
 * Checks: 1) ?_lq= query parameter, 2) Authorization: License <token> header.
 */
function extractToken(request: Request): string | null {
  // 1. Query parameter
  try {
    const url = new URL(request.url);
    const param = url.searchParams.get("_lq");
    if (param) return param;
  } catch {
    // Invalid URL — fall through to header check
  }

  // 2. Authorization header
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("License ")) {
    const token = auth.slice(8).trim();
    return token || null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createLiquadHandler(
  config: LiquadConfig
): (request: Request, options?: HandleRequestOptions) => Promise<LiquadResult> {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }

  const onError    = config.onError ?? (() => {});
  const apiBaseUrl = config.apiBaseUrl ?? "https://liquad.app";

  // One rules cache per handler instance (lazy SWR — no setInterval)
  const rulesCache = createRulesCache(config);

  // One event buffer per handler instance (batches events before sending)
  const events = createEventBuffer({
    apiKey: config.apiKey,
    apiBaseUrl,
    onError: config.onError,
  });

  return async function handleRequest(
    request: Request,
    options?: HandleRequestOptions
  ): Promise<LiquadResult> {
    try {
      // Bind the per-request waitUntil so the event buffer can use it
      events.setWaitUntil(options?.waitUntil);
      // ── Step 1: Load workspace rules ──────────────────────────────────────
      const rules = await rulesCache.getOrRefresh();
      if (!rules) {
        // No rules available yet (first fetch failed) — fail open
        return { blocked: false };
      }

      // ── Step 2: Match User-Agent against known agents ─────────────────────
      // This is the FAST PATH — non-bot traffic exits here with zero overhead
      const ua = request.headers.get("user-agent") ?? "";
      const agent = matchUserAgent(ua, rules.agents);

      if (!agent) {
        return { blocked: false };
      }

      const timestamp = new Date().toISOString();
      const host = request.headers.get("host") ?? "";
      const domain = host.replace(/:\d+$/, "");

      // ── Step 3: Verify client IP against agent's declared IP ranges ────────
      // REINFORCED: block if ranges configured but IP is missing or out of range
      const ip = extractSourceIp(request);
      const declaredRanges = agent.declared_ips ?? [];

      if (declaredRanges.length > 0) {
        if (!ip || !isIpInRanges(ip, declaredRanges)) {
          events.push({
            domain,
            request_url:           request.url,
            user_agent_name:       agent.name,
            user_agent_raw:        ua,
            matched_catalog_id:    null,
            decision:              "denied_identity_check",
            price_applied:         null,
            consumer_workspace_id: null,
            timestamp,
            source_ip:             ip,
            ic_verified:           false,
          });

          return {
            blocked: true,
            response: jsonResponse(403, {
              error:   "bot_identity_unverified",
              message: "Request IP is not within the bot operator's declared ranges",
            }),
          };
        }
      }

      // ── Step 4: Normalize URL ────────────────────────────────────────────
      const fullUrl = request.url.startsWith("http")
        ? request.url
        : `https://${domain}${request.url}`;
      const normalizedUrl = normalizeUrl(fullUrl) ?? fullUrl;

      // ── Step 4a: Check free catalog match (local, no I/O) ────────────────
      // Agent is already resolved — call findBestCatalog directly with its
      // catalog_ids instead of going through matchRequest which would
      // redundantly re-resolve the agent from the list.
      if (rules.catalogs.length > 0 && agent.catalog_ids.length > 0) {
        let reqDomain: string;
        let reqPath: string;
        try {
          const urlObj = new URL(normalizedUrl);
          reqDomain = urlObj.hostname;
          reqPath = urlObj.pathname;
        } catch {
          reqDomain = "";
          reqPath = "";
        }

        const freeCatalog = findBestCatalog(
          rules.catalogs,
          agent.catalog_ids,
          reqDomain,
          reqPath,
          0,
        );

        if (freeCatalog) {
          events.push({
            domain,
            request_url:           normalizedUrl,
            user_agent_name:       agent.name,
            user_agent_raw:        ua,
            matched_catalog_id:    freeCatalog.id,
            decision:              "granted",
            price_applied:         0,
            consumer_workspace_id: null,
            timestamp,
            source_ip:             ip,
          });
          return { blocked: false };
        }
      }

      // ── Step 5: Extract token + verify ──────────────────────────────────
      const token = extractToken(request);

      if (token) {
        // ── Step 5a: Verify HMAC token locally ────────────────────────────
        const result = await verifyToken(token, normalizedUrl, agent.ua_pattern, rules.hmac_secret);

        if (result.valid) {
          events.push({
            domain,
            request_url:           normalizedUrl,
            user_agent_name:       agent.name,
            user_agent_raw:        ua,
            matched_catalog_id:    null,
            decision:              "authorized_paid",
            price_applied:         null,
            consumer_workspace_id: null,
            timestamp,
            source_ip:             ip,
          });
          return { blocked: false };
        }

        // Token invalid or expired
        events.push({
          domain,
          request_url:           normalizedUrl,
          user_agent_name:       agent.name,
          user_agent_raw:        ua,
          matched_catalog_id:    null,
          decision:              "denied_invalid_token",
          price_applied:         null,
          consumer_workspace_id: null,
          timestamp,
          source_ip:             ip,
        });

        return {
          blocked: true,
          response: jsonResponse(403, {
            error: "invalid_token",
          }),
        };
      }

      // ── Step 6: No token, no free catalog → block (opt_out) ────────────────
      events.push({
        domain,
        request_url:           normalizedUrl,
        user_agent_name:       agent.name,
        user_agent_raw:        ua,
        matched_catalog_id:    null,
        decision:              "denied_authorization_required",
        price_applied:         null,
        consumer_workspace_id: null,
        timestamp,
        source_ip:             ip,
      });

      return {
        blocked: true,
        response: jsonResponse(403, {
          error:         "grant_required",
          authorize_url: `${apiBaseUrl}/api/sdk/transaction`,
          content_url:   normalizedUrl,
        }),
      };
    } catch (err) {
      // Catch-all: SDK must never crash the host application
      onError(err instanceof Error ? err : new Error("Unknown SDK handler error"));
      return { blocked: false };
    }
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  LiquadConfig,
  LiquadResult,
  SdkEvent,
  HandleRequestOptions,
} from "./types";
export type { CachedRules } from "./rules-cache";
export type {
  MatchableAgent,
  MatchableCatalog,
} from "./matcher";
export { matchUserAgent, findBestCatalog } from "./matcher";
export { normalizeUrl } from "./url-normalize";
export { verifyToken } from "./token-verify";
export type { TokenVerifyResult } from "./token-verify";
