import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { authorize } from "@/lib/services/consumer.service";
import { transactionSchema } from "@/lib/validations/authorize.schema";

/**
 * POST /api/consumer/v1/licenses
 *
 * Pre-authorize access to paid content. Returns HMAC-signed tokens
 * that the publisher SDK verifies locally (no callback needed).
 *
 * Authentication: API key via Authorization: Bearer <key>
 *
 * REQUEST BODY:
 * - urls: string[] (required) — URLs of the content to access (max 100)
 * - bot_id: string (optional) — UUID of the bot that will use the tokens.
 *           If provided, must match the bot bound to the API key.
 * - max_price_eur: number (optional) — price ceiling per URL
 *
 * Token validity (TTL) is controlled by the publisher via catalog.ttl_minutes.
 *
 * RESPONSES:
 * - 200: { results: [...], unmatched: [...], total_cost_eur, balance_remaining_eur }
 *        Each result includes `allowed_ips` — the intersection of the caller's
 *        declared IPs with the publisher bot's declared IPs. The gateway only
 *        accepts scrapes from these IPs; any other IP will be rejected even with
 *        a valid token.
 *        Unmatched reasons:
 *          - "no_match": URL is not indexed by any publisher
 *          - "no_catalog": URL indexed, no active catalog matches ua_pattern/price
 *          - "no_matching_ips": catalog(s) match ua_pattern but none share any IP
 *            with the caller's declared IPs — no usable token could be issued
 * - 401: Invalid API key
 * - 402: Insufficient balance
 * - 404: Domain not found
 * - 422: Validation error
 * - 500: Internal server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await authenticateConsumerKey(
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

    // The bot identity is bound to the API key. If the body also provides
    // bot_id, it must match — otherwise reject.
    if (parsed.data.bot_id && parsed.data.bot_id !== authResult.botId) {
      return NextResponse.json(
        {
          error: "bot_mismatch",
          message: "Key is bound to a specific bot; body bot_id must match or be omitted",
        },
        { status: 422 }
      );
    }

    const result = await authorize(
      authResult.workspaceId,
      authResult.apiKeyId,
      {
        ...parsed.data,
        bot_id: authResult.botId,
      },
      authResult.scopeToWorkspace
    );

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
