// ---------------------------------------------------------------------------
// API route error handling wrapper
//
// Wraps Next.js API route handlers with consistent error catching
// and known-error-code-to-HTTP-status mapping. Eliminates repetitive
// try/catch blocks in every route file.
//
// Usage:
//   export const GET = withErrorHandling(async (req) => { ... });
//   export const POST = withErrorHandling(async (req) => { ... });
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";

type HandlerFn = (req: NextRequest) => Promise<NextResponse>;

/**
 * Map of known service error message strings to HTTP status codes.
 *
 * Services throw errors with these message strings (e.g., throw new Error("FORBIDDEN")).
 * This map translates them into appropriate HTTP responses so that
 * route handlers don't need individual catch blocks.
 */
const ERROR_STATUS_MAP: Record<string, number> = {
  NOT_MEMBER: 404,
  FORBIDDEN: 403,
  CANNOT_REMOVE_OWNER: 422,
  CANNOT_CHANGE_OWNER: 422,
  USER_NOT_FOUND: 404,
  ALREADY_MEMBER: 409,
  MEMBER_NOT_FOUND: 404,
  INVALID_AGENT_IDS: 422,
  INVALID_DOMAIN_IDS: 422,
  FETCH_FAILED: 502,
  INVALID_SITEMAP: 422,
};

/**
 * Wrap a Next.js API route handler with consistent error handling.
 *
 * Catches unhandled errors thrown by services and returns a JSON
 * error response with the appropriate HTTP status code. Known error
 * codes (from ERROR_STATUS_MAP) get their mapped status; unknown
 * errors default to 500.
 *
 * @param handler - The async route handler to wrap
 * @returns A wrapped handler with error catching
 *
 * @example
 * ```typescript
 * // Before (repeated in every route):
 * export async function GET(req: NextRequest) {
 *   try { ... } catch (e) { return NextResponse.json({ error: "..." }, { status: 500 }); }
 * }
 *
 * // After:
 * export const GET = withErrorHandling(async (req) => { ... });
 * ```
 */
export function withErrorHandling(handler: HandlerFn): HandlerFn {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";

      // Look up known error codes; default to 500 for unexpected errors
      const status = ERROR_STATUS_MAP[message] ?? 500;

      // Log unexpected errors (500s) for debugging in Vercel logs
      if (status === 500) {
        console.error("[API Error]", {
          path: req.nextUrl.pathname,
          method: req.method,
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }

      return NextResponse.json({ error: message }, { status });
    }
  };
}
