import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { listAccessibleCatalogs } from "@/lib/services/consumer.service";

/**
 * GET /api/consumer/v1/catalogs
 *
 * Discovery endpoint. List the catalogs the caller's bot can purchase from,
 * across every publisher whose declared bot shares the caller's UA pattern
 * AND has at least one IP in common with the caller's declared IPs.
 *
 * A catalog is the unit of sale: it carries the price, the TTL, and the
 * allow-list (UA pattern + IPs). Use this endpoint to:
 *   - onboard ("what can I buy?")
 *   - compare pricing across publishers
 *   - pre-filter /sources requests via ?catalog_id=...
 *
 * Authentication: API key via Authorization: Bearer <key>
 *
 * BEHAVIOUR:
 * - Idempotent and free: no token issued, no balance debited.
 * - No pagination — catalog cardinality is small (« sources).
 * - When the bot_subscription has scope_to_workspace=true (default), only
 *   catalogs owned by that workspace are visible. Network access requires
 *   an explicit per-subscription opt-in.
 *
 * RESPONSE (200):
 * {
 *   catalogs: [{
 *     id, name, description, publisher_workspace_id,
 *     price_eur, ttl_minutes, rag_enabled,
 *     source_count, allowed_ips
 *   }]
 * }
 *
 * Sorted by price ascending, then name.
 *
 * ERRORS:
 * - 401: invalid API key
 * - 403: bot not active for the calling workspace
 * - 422: bot has no declared_ips
 * - 500: internal error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await authenticateConsumerKey(
      request.headers.get("authorization")
    );
    if ("error" in authResult) {
      return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
    }

    const url = new URL(request.url);
    const botId = url.searchParams.get("bot_id");
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!botId || !UUID_RE.test(botId)) {
      return NextResponse.json(
        { error: "validation_error", message: "bot_id query param is required (UUID)" },
        { status: 400 }
      );
    }

    const result = await listAccessibleCatalogs(
      authResult.workspaceId,
      botId,
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
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
