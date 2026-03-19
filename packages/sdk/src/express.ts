/**
 * Express/Connect adapter for the Liquad SDK.
 *
 * Converts the Web API handler (Request → LiquadResult) into an
 * Express-compatible middleware (req, res, next).
 *
 * This is the ONLY file in the SDK that uses Node.js types.
 *
 * Usage:
 *   import { createLiquadHandler, toExpressMiddleware } from "@liquad/sdk";
 *   const handler = createLiquadHandler({ apiKey: "lq_..." });
 *   app.use(toExpressMiddleware(handler));
 */

import type { IncomingMessage, ServerResponse } from "http";
import type { LiquadResult } from "./types";

type LiquadHandler = (request: Request) => Promise<LiquadResult>;

/**
 * Wrap a Liquad handler as Express/Connect middleware.
 *
 * Converts IncomingMessage to a Web API Request, calls the handler,
 * and either sends the blocked response or calls next().
 *
 * NOTE: The reverse proxy MUST pass `x-forwarded-proto` and `host` headers
 * for URL reconstruction to work correctly.
 */
export function toExpressMiddleware(handler: LiquadHandler) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> => {
    try {
      const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
      const host = req.headers.host ?? "localhost";
      const url = `${proto}://${host}${req.url}`;

      const webReq = new Request(url, {
        method: req.method,
        headers: Object.fromEntries(
          Object.entries(req.headers)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v!])
        ),
      });

      const result = await handler(webReq);

      if (result.blocked && result.response) {
        const headers: Record<string, string> = {};
        result.response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        res.writeHead(result.response.status, headers);
        res.end(await result.response.text());
      } else {
        next();
      }
    } catch {
      // Failsafe: never crash the host server
      next();
    }
  };
}
