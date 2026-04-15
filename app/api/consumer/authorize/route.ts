import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/services/auth.service";
import { authorize } from "@/lib/services/consumer.service";
import { transactionSchema } from "@/lib/validations/authorize.schema";

/**
 * POST /api/consumer/authorize
 *
 * Pre-authorize access to paid content. Returns HMAC-signed tokens
 * that the publisher SDK verifies locally (no callback needed).
 *
 * Authentication: API key via Authorization: Bearer <key>
 *
 * REQUEST BODY:
 * - urls: string[] (required) — URLs of the content to access (max 100)
 * - agent_id: string (required) — UUID of the bot that will use the tokens
 * - max_price_eur: number (optional) — price ceiling per URL
 *
 * Token validity (TTL) is controlled by the publisher via catalog.ttl_minutes.
 *
 * RESPONSES:
 * - 200: { results: [...], unmatched: [...], total_cost_eur, balance_remaining_eur }
 * - 401: Invalid API key
 * - 402: Insufficient balance
 * - 404: Domain not found
 * - 422: Validation error
 * - 500: Internal server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await authenticateApiKey(
      request.headers.get("authorization")
    );
    if ("error" in authResult) {
      return NextResponse.json(
        { error: "invalid_api_key" },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "validation_error", message: "Invalid JSON body" },
        { status: 422 }
      );
    }

    const parsed = transactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const result = await authorize(authResult.workspaceId, parsed.data);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.details ? { details: result.details } : {}) },
        { status: result.status }
      );
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
