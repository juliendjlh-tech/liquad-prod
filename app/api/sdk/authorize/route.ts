import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/services/authorize.service";
import { authorizeSchema } from "@/lib/validations/authorize.schema";

/**
 * POST /api/sdk/authorize
 *
 * Pre-authorize access to paid content. Returns a JWT grant token.
 *
 * Authentication: API key via Authorization: Bearer <key>
 * NOT protected by session middleware (/api/sdk/* is bypassed).
 *
 * REQUEST BODY:
 * - url: string (required) — URL of the content to access
 * - max_price_eur: number (optional) — price ceiling
 *
 * RESPONSES:
 * - 200: Access granted (with JWT) or free (bot not tracked)
 * - 401: Invalid API key
 * - 402: Insufficient balance, price exceeds max
 * - 403: No matching catalog
 * - 404: Domain not found (no publisher with this verified domain)
 * - 422: Validation error (invalid body)
 * - 500: Internal server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "validation_error", message: "Invalid JSON body" },
        { status: 422 }
      );
    }

    const parsed = authorizeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    // 2. Call authorize service
    const authHeader = request.headers.get("authorization");
    const userAgent = request.headers.get("user-agent");
    const result = await authorize(authHeader, userAgent, parsed.data);

    // 3. Map result to HTTP response
    if ("error" in result) {
      const { status, ...body } = result;
      return NextResponse.json(body, { status });
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
