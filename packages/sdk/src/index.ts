import type { IncomingMessage, ServerResponse } from "http";
import type { LiquadConfig, LiquadMiddleware, JwtPayload } from "./types";
import { createRulesCache } from "./rules-cache";
import { createEventBuffer } from "./event-buffer";
import type { SdkEvent } from "./event-buffer";
import { matchRequest } from "./matcher";
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
 * 6. Buffers access events and sends them in batches to POST /api/sdk/events
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

  // Start cache and buffer (non-blocking)
  void rulesCache.start();
  eventBuffer.start();

  /**
   * Async request handler. Called via fire-and-forget from the sync middleware.
   * jwtVerify (from jose) is async, so we need this wrapper.
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

      const decision = matchRequest(
        rules,
        { url, host, userAgent },
        defaultPrice
      );

      switch (decision.type) {
        case "passthrough":
          next();
          break;

        case "granted":
          eventBuffer.add(decision.event);
          next();
          break;

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

                // JWT valid! Serve content
                eventBuffer.add({
                  ...decision.event,
                  decision: "authorized_paid",
                  consumer_workspace_id: jwtPayload.sub,
                });
                next();
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
      await eventBuffer.stop();
    };

  return middleware;
}

// Re-export types
export type { LiquadConfig, LiquadMiddleware, JwtPayload } from "./types";
export type { CachedRules } from "./rules-cache";
export type { SdkEvent } from "./event-buffer";
export type { MatchDecision } from "./matcher";
