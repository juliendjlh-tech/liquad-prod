import type { IncomingMessage, ServerResponse } from "http";
import type { DataFlowConfig, DataFlowMiddleware } from "./types";
import { createRulesCache } from "./rules-cache";
import { createEventBuffer } from "./event-buffer";
import { matchRequest } from "./matcher";

/**
 * Create a DataFlow middleware that intercepts incoming requests
 * and applies AI content licensing rules.
 *
 * Usage:
 *   const middleware = createDataFlowMiddleware({ apiKey: 'df_...' });
 *   app.use(middleware); // Express
 *
 * The middleware:
 * 1. On startup: fetches rules from GET /api/sdk/rules (cached, refreshed periodically)
 * 2. On each request: checks if the user-agent matches a declared bot
 * 3. If undeclared bot or non-bot: calls next() immediately (free access)
 * 4. If declared bot: applies catalog matching logic
 * 5. Buffers access events and sends them in batches to POST /api/sdk/events
 *
 * CRITICAL: The middleware NEVER throws errors. All errors are caught and
 * passed to onError callback. The host server must never crash due to the SDK.
 *
 * @param config - SDK configuration
 * @returns Express/Connect-compatible middleware function
 * @throws Error only if apiKey is missing (at creation time, not at runtime)
 */
export function createDataFlowMiddleware(
  config: DataFlowConfig
): DataFlowMiddleware {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }

  const defaultPrice = config.defaultPrice ?? 0;
  const onError = config.onError ?? (() => {});

  // Initialize subsystems
  const rulesCache = createRulesCache(config);
  const eventBuffer = createEventBuffer(config);

  // Start cache and buffer (non-blocking)
  void rulesCache.start();
  eventBuffer.start();

  // Return the middleware function
  const middleware: DataFlowMiddleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void => {
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

      const decision = matchRequest(rules, { url, host, userAgent }, defaultPrice);

      switch (decision.type) {
        case "passthrough":
          next();
          break;

        case "granted":
          eventBuffer.add(decision.event);
          next();
          break;

        case "denied": {
          const body = JSON.stringify(decision.responseBody);
          res.writeHead(402, {
            "Content-Type": "application/json",
            "X-DataFlow-Status": "licensing-required",
            "Content-Length": Buffer.byteLength(body),
          });
          res.end(body);
          eventBuffer.add(decision.event);
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
  };

  // Attach cleanup method for graceful shutdown
  (middleware as DataFlowMiddleware & { destroy: () => Promise<void> }).destroy =
    async () => {
      rulesCache.stop();
      await eventBuffer.stop();
    };

  return middleware;
}

// Re-export types
export type { DataFlowConfig, DataFlowMiddleware } from "./types";
export type { CachedRules } from "./rules-cache";
export type { SdkEvent } from "./event-buffer";
export type { MatchDecision } from "./matcher";
