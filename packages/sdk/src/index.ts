/**
 * Liquad SDK — Express/Connect Middleware for AI Content Licensing
 *
 * This is the main entry point for the Liquad SDK. It creates an Express/Connect-
 * compatible middleware that intercepts incoming requests and applies AI content
 * licensing rules, including Identity Check (DNS-based bot verification).
 *
 * ## Pipeline Flow (with Identity Check):
 *
 * ```
 * Request arrives
 *   │
 *   ├─ No rules loaded? ──► passthrough (next())
 *   │
 *   ├─ Domain not verified? ──► passthrough
 *   │
 *   ├─ User-agent not matched? ──► passthrough
 *   │
 *   ├─ No matching catalog? ──► 403 blocked_no_catalog
 *   │
 *   ├─ Price <= defaultPrice ──► "granted" ──┐
 *   │                                        │
 *   └─ Price > defaultPrice ──► JWT check ──►│ "authorized_paid" or 402
 *                                            │
 *                           ┌────────────────┘
 *                           ▼
 *                    Identity Check gate
 *                           │
 *                    ├─ No dns_patterns? ──► serve content (skip IC)
 *                    └─ Has dns_patterns ──► DNS verify
 *                           │
 *                    ├─ Verified ──► serve content + IC metadata in event
 *                    └─ Unverified ──► 403 denied_identity_check
 * ```
 *
 * @module liquad-sdk
 */

import type { IncomingMessage, ServerResponse } from "http";
import type { LiquadConfig, LiquadMiddleware, JwtPayload } from "./types";
import { createRulesCache } from "./rules-cache";
import { createEventBuffer } from "./event-buffer";
import type { SdkEvent } from "./event-buffer";
import { matchRequest } from "./matcher";
import { createIdentityChecker } from "./identity-check";
import type { VerificationResult } from "./identity-check";
import { jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a URL for JWT claim comparison.
 * Mirrors lib/utils/url-normalize.ts in the main app.
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
 * Send a JSON error response.
 */
function sendJsonResponse(
  res: ServerResponse,
  status: number,
  body: object
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * Extract the client IP address from an incoming request.
 *
 * Strips the `::ffff:` prefix that Node.js adds to IPv4-mapped IPv6 addresses.
 * Example: `::ffff:1.2.3.4` → `1.2.3.4`
 *
 * @param req - The incoming HTTP request
 * @returns The client's IPv4 address, or null if not available
 */
function extractSourceIp(req: IncomingMessage): string | null {
  const rawIp = req.socket?.remoteAddress ?? null;
  if (!rawIp) return null;

  // Strip IPv4-mapped IPv6 prefix (::ffff:1.2.3.4 → 1.2.3.4)
  if (rawIp.startsWith("::ffff:")) {
    return rawIp.slice(7);
  }

  return rawIp;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

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
 * 6. **Identity Check**: If the bot has dns_patterns configured,
 *    verifies the bot's IP via DNS before serving content.
 *    Spoofed bots get 403 denied_identity_check.
 * 7. Buffers access events and sends them in batches to POST /api/sdk/events
 *
 * CRITICAL: The middleware NEVER throws errors. All errors are caught and
 * passed to onError callback. The host server must never crash due to the SDK.
 *
 * @param config - SDK configuration
 * @returns Express/Connect-compatible middleware function
 * @throws Error only if apiKey is missing (at creation time, not at runtime)
 */
export function createLiquadMiddleware(
  config: LiquadConfig
): LiquadMiddleware {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }

  const defaultPrice = config.defaultPrice ?? 0;
  const onError = config.onError ?? (() => {});
  const apiBaseUrl = config.apiBaseUrl ?? "https://liquad.app";

  // Initialize subsystems
  const rulesCache = createRulesCache(config);
  const eventBuffer = createEventBuffer(config);

  // Initialize Identity Checker with default config.
  // The actual IC config (TTL, timeout) comes from the rules cache
  // at runtime. We create the checker with defaults here.
  const identityChecker = createIdentityChecker({
    onError,
  });

  // Start cache, buffer, and IC cleanup timer (non-blocking)
  void rulesCache.start();
  eventBuffer.start();
  identityChecker.start();

  // ---------------------------------------------------------------------------
  // Identity Check Helper
  // ---------------------------------------------------------------------------

  /**
   * Perform Identity Check on a bot request, if applicable.
   *
   * IC is always active — the per-bot `dns_patterns` array controls
   * whether a specific bot is verified:
   * - If bot has no dns_patterns → skip (return null)
   * - Otherwise → perform DNS verification
   *
   * @param ip - Bot's IP address
   * @param botId - Bot's UUID from the matched user_agent
   * @param dnsPatterns - Bot's expected DNS patterns
   * @returns VerificationResult if IC was performed, null if skipped
   */
  async function performIdentityCheck(
    ip: string | null,
    botId: string,
    dnsPatterns: string[]
  ): Promise<VerificationResult | null> {
    // Bot has no dns_patterns → skip IC for this bot
    if (!dnsPatterns || dnsPatterns.length === 0) {
      return null;
    }

    // No IP available → can't perform DNS verification
    if (!ip) {
      return {
        verified: false,
        hostname: null,
        durationMs: 0,
        cached: false,
      };
    }

    // Perform DNS verification
    return identityChecker.verify(ip, botId, dnsPatterns);
  }

  /**
   * Add IC metadata to an event, if a verification was performed.
   *
   * @param event - The base SDK event
   * @param sourceIp - The bot's IP address
   * @param icResult - The IC verification result (null if IC was skipped)
   * @returns The event with IC metadata added (or unchanged if IC was skipped)
   */
  function enrichEventWithIcMetadata(
    event: SdkEvent,
    sourceIp: string | null,
    icResult: VerificationResult | null
  ): SdkEvent {
    if (!icResult) {
      // IC was not performed — return event as-is (no IC metadata)
      return event;
    }

    return {
      ...event,
      source_ip: sourceIp,
      ic_verified: icResult.verified,
      ic_hostname: icResult.hostname,
      ic_duration_ms: icResult.durationMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Request Handler
  // ---------------------------------------------------------------------------

  /**
   * Async request handler. Called via fire-and-forget from the sync middleware.
   * jwtVerify (from jose) and IC verify are async, so we need this wrapper.
   */
  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    try {
      const rules = rulesCache.getRules();

      // No rules = passthrough mode
      if (!rules) {
        next();
        return;
      }

      // Extract request info
      const host = req.headers.host ?? "";
      const userAgent = req.headers["user-agent"] ?? "";
      const url = req.url ?? "/";
      const sourceIp = extractSourceIp(req);

      const decision = matchRequest(
        rules,
        { url, host, userAgent },
        defaultPrice
      );

      switch (decision.type) {
        case "passthrough":
          // Non-bot or unverified domain → no IC needed
          next();
          break;

        case "granted": {
          // Free access granted → now check Identity Check
          // Find the matched bot's dns_patterns from the rules
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
              // Bot failed IC → deny with 403
              sendJsonResponse(res, 403, {
                error: "bot_identity_unverified",
                message: "Bot identity could not be verified",
              });

              eventBuffer.add(
                enrichEventWithIcMetadata(
                  {
                    ...decision.event,
                    decision: "denied_identity_check",
                  },
                  sourceIp,
                  icResult
                )
              );
              return;
            }

            // IC passed or skipped → serve content
            eventBuffer.add(
              enrichEventWithIcMetadata(decision.event, sourceIp, icResult)
            );
            next();
          } catch (icErr) {
            // IC error → failsafe: serve content (don't block on IC failure)
            onError(
              icErr instanceof Error
                ? icErr
                : new Error("Identity Check error")
            );
            eventBuffer.add(decision.event);
            next();
          }
          break;
        }

        case "denied": {
          // Check for JWT Authorization: License header
          const authHeader = req.headers["authorization"];

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
                const requestUrl = url.startsWith("http")
                  ? url
                  : `https://${domain}${url.startsWith("/") ? url : "/" + url}`;
                const normalizedRequestUrl = normalizeUrlForSdk(requestUrl);

                // Validate claim: publisher must match this workspace
                if (jwtPayload.pub !== rules.workspace_id) {
                  sendJsonResponse(res, 402, {
                    error: "invalid_token",
                    reason: "invalid_publisher",
                  });
                  eventBuffer.add({
                    ...decision.event,
                    decision: "denied_invalid_token",
                    consumer_workspace_id: jwtPayload.sub ?? null,
                  });
                  return;
                }

                // Validate claim: URL must match the requested content
                if (jwtPayload.url !== normalizedRequestUrl) {
                  sendJsonResponse(res, 402, {
                    error: "invalid_token",
                    reason: "url_mismatch",
                  });
                  eventBuffer.add({
                    ...decision.event,
                    decision: "denied_invalid_token",
                    consumer_workspace_id: jwtPayload.sub ?? null,
                  });
                  return;
                }

                // JWT valid! Now perform Identity Check before serving content
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
                    // Bot failed IC → deny even though JWT is valid
                    sendJsonResponse(res, 403, {
                      error: "bot_identity_unverified",
                      message: "Bot identity could not be verified",
                    });
                    eventBuffer.add(
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
                    return;
                  }

                  // IC passed or skipped → serve paid content
                  eventBuffer.add(
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
                  next();
                } catch (icErr) {
                  // IC error → failsafe: serve content
                  onError(
                    icErr instanceof Error
                      ? icErr
                      : new Error("Identity Check error")
                  );
                  eventBuffer.add({
                    ...decision.event,
                    decision: "authorized_paid",
                    consumer_workspace_id: jwtPayload.sub,
                  });
                  next();
                }
                return;
              } catch (jwtErr) {
                // JWT expired, invalid signature, malformed, etc.
                const reason =
                  jwtErr instanceof Error &&
                  jwtErr.message.includes("expired")
                    ? "token_expired"
                    : "invalid_token";

                sendJsonResponse(res, 402, {
                  error: "invalid_token",
                  reason,
                });
                eventBuffer.add({
                  ...decision.event,
                  decision: "denied_invalid_token",
                  consumer_workspace_id: null,
                });
                return;
              }
            }
          }

          // No JWT or no secret → deny with authorization instructions
          const deniedEvent: SdkEvent = {
            ...decision.event,
            decision: "denied_authorization_required",
            consumer_workspace_id: null,
          };

          sendJsonResponse(res, 402, {
            error: "authorization_required",
            authorize_url: `${apiBaseUrl}/api/sdk/authorize`,
            content_url: decision.event.request_url,
            price_eur: decision.price,
          });
          eventBuffer.add(deniedEvent);
          break;
        }

        case "blocked_no_catalog": {
          // Bot has no matching catalog → IC is not triggered (no wasted DNS lookup)
          const errorBody = JSON.stringify({ error: "Access denied" });
          res.writeHead(403, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(errorBody),
          });
          res.end(errorBody);
          eventBuffer.add(decision.event);
          break;
        }
      }
    } catch (err) {
      // Failsafe: never crash the host server
      onError(
        err instanceof Error ? err : new Error("Unknown SDK middleware error")
      );
      next();
    }
  }

  // Return the synchronous middleware wrapper (fire-and-forget async)
  const middleware: LiquadMiddleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void => {
    void handleRequest(req, res, next);
  };

  // Attach cleanup method for graceful shutdown
  (middleware as LiquadMiddleware & { destroy: () => Promise<void> }).destroy =
    async () => {
      rulesCache.stop();
      identityChecker.stop();
      await eventBuffer.stop();
    };

  return middleware;
}

// Re-export types
export type { LiquadConfig, LiquadMiddleware, JwtPayload } from "./types";
export type { CachedRules } from "./rules-cache";
export type { SdkEvent } from "./event-buffer";
export type { MatchDecision } from "./matcher";
export type { VerificationResult, IdentityChecker } from "./identity-check";
