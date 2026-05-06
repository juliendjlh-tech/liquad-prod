import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { authorize } from "@/lib/services/consumer.service";
import { transactionSchema } from "@/lib/validations/authorize.schema";

/**
 * POST /api/consumer/v1/licenses
 *
 * Pre-authorize access to paid content. Returns one entry per input URL with
 * a ready-to-fetch `crawl_url` — the caller can blindly fetch it without
 * recombining URL + token.
 *
 * Authentication: API key via Authorization: Bearer <key>
 *
 * REQUEST BODY:
 * - urls: string[] (required) — URLs of the content to access (max 100)
 * - bot_id: string (optional) — UUID of the bot the consumer is acting as.
 *           Required unless the API key was issued with a default_bot_id, in
 *           which case the body bot_id overrides the default if both are set.
 * - max_price_eur: number (optional) — price ceiling per URL
 *
 * Token validity (TTL) is controlled by the publisher via catalog.ttl_minutes.
 *
 * RESPONSES:
 * - 200: { results: [...], total_cost_eur, balance_remaining_eur }
 *        results[].crawl_url is always present and always fetchable:
 *          - granted               → original URL with `?_lq=<token>` appended
 *          - any unmatched reason  → original URL unchanged (no token)
 *        Granted entries also include `token`, `price_eur`, `catalog_id`,
 *        `expires_at`, `cached`, `allowed_ips` — the IP intersection the
 *        gateway will accept.
 *        Per-URL `reason`:
 *          - "granted":          token issued, debited (or cached within TTL)
 *          - "no_match":         URL not indexed by any publisher
 *          - "no_catalog":       indexed but no active catalog covers the bot
 *          - "no_matching_ips":  UA-compatible catalog exists but no IP overlap
 *          - "domain_not_registered": the host is not operated by any publisher
 *          - "insufficient_balance": balance too low — graceful degradation,
 *            every result falls back to crawl_url=URL with no token
 * - 401: Invalid API key (strict — never degraded)
 * - 422: Validation error / bot_id_required / bot_missing_ips / invalid_url
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

    // bot_id resolution: body wins, otherwise fallback to the key's default.
    // authorize() validates the resolved bot_id against workspace_bots.
    const resolvedBotId = parsed.data.bot_id ?? authResult.defaultBotId ?? undefined;

    const result = await authorize(
      authResult.workspaceId,
      authResult.apiKeyId,
      { ...parsed.data, bot_id: resolvedBotId },
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
