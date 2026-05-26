import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { authorize } from "@/lib/services/consumer.service";
import { transactionSchema } from "@/lib/validations/authorize.schema";

/**
 * POST /api/public/v1/consumer/licenses
 *
 * Pre-authorize access to paid content. Returns one entry per input URL with
 * a ready-to-fetch `crawl_url` — the caller can blindly fetch it without
 * recombining URL + token.
 *
 * Authentication: API key via Authorization: Bearer <key>
 *
 * REQUEST BODY:
 * - urls: string[] (required) — URLs of the content to access (max 100)
 *
 * Since migration 041 the API key carries an immutable triple
 * (subscription, network, bot). The body no longer needs a bot_id — the key
 * defines which bot identity is claimed, and the network defines which
 * catalogues are reachable. Token validity (TTL) is controlled by the
 * publisher via catalog.ttl_minutes.
 *
 * RESPONSES:
 * - 200: { results: [...], total_cost_eur, balance_remaining_eur }
 *        results[].crawl_url is always present and always fetchable:
 *          - granted               → original URL with `?_lq=<token>` appended
 *          - any unmatched reason  → original URL unchanged (no token)
 *        Granted entries also include `token`, `price_eur`, `catalog_id`,
 *        `expires_at`, `cached`, `allowed_ips`.
 *        Per-URL `reason`:
 *          - "granted":              token issued, debited (or cached within TTL)
 *          - "no_match":             URL not indexed by any publisher
 *          - "no_catalog":           indexed but no accepted-network catalogue covers the bot
 *          - "no_matching_ips":      UA-compatible catalogue exists but no IP overlap
 *          - "domain_not_registered": the host is not operated by any publisher
 *          - "insufficient_balance": balance too low — graceful degradation
 * - 401: Invalid API key (strict — never degraded)
 * - 422: Validation error / bot_missing_ips / invalid_url
 * - 404: bot_not_found
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

    const result = await authorize(
      authResult.workspaceId,
      authResult.apiKeyId,
      authResult.networkId,
      authResult.botId,
      parsed.data,
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
