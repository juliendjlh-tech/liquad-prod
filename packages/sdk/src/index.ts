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

import type { LiquadConfig, LiquadResult, JwtPayload, SdkEvent } from "./types";
import { createRulesCache } from "./rules-cache";
import { matchRequest } from "./matcher";
import { createIdentityChecker } from "./identity-check";
import type { VerificationResult } from "./identity-check";
import { jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a URL for JWT claim comparison.
 */
function normalizeUrlForSdk(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${url.protocol}//${url.hostname}${path}`;
  } catch {
    return rawUrl;
  }
}

/**
 * Create a JSON Response.
 */
function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Extract the client IP address from request headers.
 * Checks CF-Connecting-IP (Cloudflare), then X-Forwarded-For (standard proxy).
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
 * Send a single event to the Liquad API.
 * Fire-and-forget or via waitUntil if provided.
 */
function sendEvent(config: LiquadConfig, event: SdkEvent): void {
  const url = `${config.apiBaseUrl ?? "https://liquad.app"}/api/sdk/events`;
  const promise = fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ events: [event] }),
  }).catch((err) => {
    const onError = config.onError ?? (() => {});
    onError(
      err instanceof Error ? err : new Error("Event send error")
    );
  });

  if (config.waitUntil) {
    config.waitUntil(promise);
  }
  // In Node.js (long-lived process), the promise resolves on its own
}

// ---------------------------------------------------------------------------
// Identity Check Helpers
// ---------------------------------------------------------------------------

/**
 * Add IC metadata to an event, if a verification was performed.
 */
function enrichEventWithIcMetadata(
  event: SdkEvent,
  sourceIp: string | null,
  icResult: VerificationResult | null
): SdkEvent {
  if (!icResult) return event;

  return {
    ...event,
    source_ip: sourceIp,
    ic_verified: icResult.verified,
    ic_hostname: icResult.hostname,
    ic_duration_ms: icResult.durationMs,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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
export function createLiquadHandler(
  config: LiquadConfig
): (request: Request) => Promise<LiquadResult> {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }

  const defaultPrice = config.defaultPrice ?? 0;
  const onError = config.onError ?? (() => {});
  const apiBaseUrl = config.apiBaseUrl ?? "https://liquad.app";

  // Initialize subsystems
  const rulesCache = createRulesCache(config);
  const identityChecker = createIdentityChecker({ onError });

  // ---------------------------------------------------------------------------
  // IC Helper
  // ---------------------------------------------------------------------------

  async function performIdentityCheck(
    ip: string | null,
    botId: string,
    dnsPatterns: string[]
  ): Promise<VerificationResult | null> {
    if (!dnsPatterns || dnsPatterns.length === 0) return null;

    if (!ip) {
      return {
        verified: false,
        hostname: null,
        durationMs: 0,
        cached: false,
      };
    }

    return identityChecker.verify(ip, botId, dnsPatterns);
  }

  // ---------------------------------------------------------------------------
  // Main Handler
  // ---------------------------------------------------------------------------

  return async function handleRequest(
    request: Request
  ): Promise<LiquadResult> {
    try {
      const rules = await rulesCache.getOrRefresh();

      // No rules = passthrough mode
      if (!rules) {
        return { blocked: false };
      }

      // Extract request info from Web API Request
      const host = request.headers.get("host") ?? "";
      const userAgent = request.headers.get("user-agent") ?? "";
      const requestUrl = new URL(request.url);
      const url = requestUrl.pathname + requestUrl.search;
      const sourceIp = extractSourceIp(request);

      const decision = matchRequest(
        rules,
        { url: request.url, host, userAgent },
        defaultPrice
      );

      switch (decision.type) {
        case "passthrough":
          return { blocked: false };

        case "granted": {
          const matchedAgent = rules.user_agents.find(
            (a) => a.name === decision.event.user_agent_name
          );
          const dnsPatterns = matchedAgent?.dns_patterns ?? [];

          try {
            const icResult = await performIdentityCheck(
              sourceIp,
              matchedAgent?.id ?? "",
              dnsPatterns
            );

            if (icResult && !icResult.verified) {
              sendEvent(
                config,
                enrichEventWithIcMetadata(
                  { ...decision.event, decision: "denied_identity_check" },
                  sourceIp,
                  icResult
                )
              );
              return {
                blocked: true,
                response: jsonResponse(403, {
                  error: "bot_identity_unverified",
                  message: "Bot identity could not be verified",
                }),
              };
            }

            sendEvent(
              config,
              enrichEventWithIcMetadata(decision.event, sourceIp, icResult)
            );
            return { blocked: false };
          } catch (icErr) {
            // IC error → failsafe: serve content
            onError(
              icErr instanceof Error
                ? icErr
                : new Error("Identity Check error")
            );
            sendEvent(config, decision.event);
            return { blocked: false };
          }
        }

        case "denied": {
          const authHeader = request.headers.get("authorization");

          if (authHeader && authHeader.startsWith("License ")) {
            const jwtSecret = rulesCache.getJwtSecret();

            if (jwtSecret) {
              try {
                const token = authHeader.slice(8);
                const secret = new TextEncoder().encode(jwtSecret);
                const { payload } = await jwtVerify(token, secret, {
                  algorithms: ["HS256"],
                });

                const jwtPayload = payload as unknown as JwtPayload;

                // Build normalized request URL for comparison
                const domain = host.replace(/:\d+$/, "");
                const fullUrl = request.url.startsWith("http")
                  ? request.url
                  : `https://${domain}${url.startsWith("/") ? url : "/" + url}`;
                const normalizedRequestUrl = normalizeUrlForSdk(fullUrl);

                // Validate: publisher must match this workspace
                if (jwtPayload.pub !== rules.workspace_id) {
                  sendEvent(config, {
                    ...decision.event,
                    decision: "denied_invalid_token",
                    consumer_workspace_id: jwtPayload.sub ?? null,
                  });
                  return {
                    blocked: true,
                    response: jsonResponse(402, {
                      error: "invalid_token",
                      reason: "invalid_publisher",
                    }),
                  };
                }

                // Validate: URL must match
                if (jwtPayload.url !== normalizedRequestUrl) {
                  sendEvent(config, {
                    ...decision.event,
                    decision: "denied_invalid_token",
                    consumer_workspace_id: jwtPayload.sub ?? null,
                  });
                  return {
                    blocked: true,
                    response: jsonResponse(402, {
                      error: "invalid_token",
                      reason: "url_mismatch",
                    }),
                  };
                }

                // JWT valid → perform Identity Check
                const matchedAgent = rules.user_agents.find(
                  (a) => a.name === decision.event.user_agent_name
                );
                const dnsPatterns = matchedAgent?.dns_patterns ?? [];

                try {
                  const icResult = await performIdentityCheck(
                    sourceIp,
                    matchedAgent?.id ?? "",
                    dnsPatterns
                  );

                  if (icResult && !icResult.verified) {
                    sendEvent(
                      config,
                      enrichEventWithIcMetadata(
                        {
                          ...decision.event,
                          decision: "denied_identity_check",
                          consumer_workspace_id: jwtPayload.sub,
                        },
                        sourceIp,
                        icResult
                      )
                    );
                    return {
                      blocked: true,
                      response: jsonResponse(403, {
                        error: "bot_identity_unverified",
                        message: "Bot identity could not be verified",
                      }),
                    };
                  }

                  // IC passed or skipped → authorize
                  sendEvent(
                    config,
                    enrichEventWithIcMetadata(
                      {
                        ...decision.event,
                        decision: "authorized_paid",
                        consumer_workspace_id: jwtPayload.sub,
                      },
                      sourceIp,
                      icResult
                    )
                  );
                  return { blocked: false };
                } catch (icErr) {
                  // IC error → failsafe: serve content
                  onError(
                    icErr instanceof Error
                      ? icErr
                      : new Error("Identity Check error")
                  );
                  sendEvent(config, {
                    ...decision.event,
                    decision: "authorized_paid",
                    consumer_workspace_id: jwtPayload.sub,
                  });
                  return { blocked: false };
                }
              } catch (jwtErr) {
                const reason =
                  jwtErr instanceof Error &&
                  jwtErr.message.includes("expired")
                    ? "token_expired"
                    : "invalid_token";

                sendEvent(config, {
                  ...decision.event,
                  decision: "denied_invalid_token",
                  consumer_workspace_id: null,
                });
                return {
                  blocked: true,
                  response: jsonResponse(402, {
                    error: "invalid_token",
                    reason,
                  }),
                };
              }
            }
          }

          // No JWT or no secret → deny with authorization instructions
          sendEvent(config, {
            ...decision.event,
            decision: "denied_authorization_required",
            consumer_workspace_id: null,
          });
          return {
            blocked: true,
            response: jsonResponse(402, {
              error: "authorization_required",
              authorize_url: `${apiBaseUrl}/api/sdk/authorize`,
              content_url: decision.event.request_url,
              price_eur: decision.price,
            }),
          };
        }

        case "blocked_no_catalog": {
          sendEvent(config, decision.event);
          return {
            blocked: true,
            response: jsonResponse(403, { error: "Access denied" }),
          };
        }
      }
    } catch (err) {
      // Failsafe: never crash the host
      onError(
        err instanceof Error ? err : new Error("Unknown SDK handler error")
      );
      return { blocked: false };
    }
  };
}

// Re-export types
export type {
  LiquadConfig,
  LiquadResult,
  JwtPayload,
  SdkEvent,
  FilterRule,
  DomainRule,
  CatalogFilterRules,
} from "./types";
export type { CachedRules } from "./rules-cache";
export type { MatchDecision } from "./matcher";
export type { VerificationResult, IdentityChecker } from "./identity-check";
export { toExpressMiddleware } from "./express";
