import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { listAccessibleSources, SOURCES_LIMITS } from "@/lib/services/consumer.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE = /^[a-zA-Z0-9.-]+$/;
// Path prefixes are user-supplied LIKE arguments; we only accept printable ASCII
// without control chars / whitespace. Everything past this is escaped in the
// service layer (% _ \ → \%, \_, \\) so a literal prefix matches literally.
const PATH_PREFIX_RE = /^[\x21-\x7E]+$/;

/**
 * GET /api/consumer/v1/sources
 *
 * Discovery endpoint. List indexed URLs the caller's bot has access to,
 * across every publisher whose declared bot shares the caller's UA pattern
 * AND has at least one IP in common with the caller's declared IPs.
 *
 * Authentication: API key via Authorization: Bearer <key>
 *
 * QUERY PARAMS (all optional):
 * - cursor: opaque UUID from previous response's `next_cursor`
 * - limit: 1..5000, default 1000
 * - domain: hostname filter (e.g. "lemonde.fr"), resolved to domain_id server-side
 * - path_prefix: URL path prefix (e.g. "/blog/"), uses idx_sources_ws_domain_path
 * - catalog_id: repeatable, restricts the result to this subset of accessible
 *   catalogs (max 50 entries; values outside the accessible set are silently ignored)
 *
 * BEHAVIOUR:
 * - Idempotent and free: no token issued, no balance debited.
 * - Keyset pagination on indexed_sources.id (UUID, ascending). Stable order,
 *   constant-time per page. `next_cursor: null` signals end of pages.
 * - When the bot_subscription has scope_to_workspace=true (default), only
 *   catalogs owned by that workspace are visible. Network access requires
 *   an explicit per-subscription opt-in.
 *
 * RESPONSES:
 * - 200: { sources: [...], next_cursor: string | null }
 *        Each source: { id, url, path, domain, best_catalog: { id, name, price_eur, ttl_minutes }, allowed_ips }
 * - 400: invalid query param
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

    // ── cursor ──
    const cursorParam = url.searchParams.get("cursor") ?? undefined;
    if (cursorParam !== undefined && !UUID_RE.test(cursorParam)) {
      return NextResponse.json(
        { error: "validation_error", message: "cursor must be a UUID" },
        { status: 400 }
      );
    }

    // ── limit ──
    const limitParam = url.searchParams.get("limit");
    let limit: number | undefined;
    if (limitParam !== null) {
      const parsed = Number(limitParam);
      if (
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > SOURCES_LIMITS.max
      ) {
        return NextResponse.json(
          {
            error: "validation_error",
            message: `limit must be an integer between 1 and ${SOURCES_LIMITS.max}`,
          },
          { status: 400 }
        );
      }
      limit = parsed;
    }

    // ── domain ──
    const domain = url.searchParams.get("domain") ?? undefined;
    if (domain !== undefined) {
      if (!DOMAIN_RE.test(domain) || domain.length > 253) {
        return NextResponse.json(
          { error: "validation_error", message: "Invalid domain" },
          { status: 400 }
        );
      }
    }

    // ── path_prefix ──
    const pathPrefix = url.searchParams.get("path_prefix") ?? undefined;
    if (pathPrefix !== undefined) {
      if (!PATH_PREFIX_RE.test(pathPrefix) || pathPrefix.length > 512) {
        return NextResponse.json(
          {
            error: "validation_error",
            message: "path_prefix must be printable ASCII without whitespace, max 512 chars",
          },
          { status: 400 }
        );
      }
    }

    // ── bot_id (required since migration 032) ──
    const botId = url.searchParams.get("bot_id");
    if (!botId || !UUID_RE.test(botId)) {
      return NextResponse.json(
        { error: "validation_error", message: "bot_id query param is required (UUID)" },
        { status: 400 }
      );
    }

    // ── catalog_id (repeatable) ──
    const catalogIds = url.searchParams.getAll("catalog_id");
    if (catalogIds.length > SOURCES_LIMITS.catalogIdFilterMax) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: `catalog_id supports at most ${SOURCES_LIMITS.catalogIdFilterMax} values per request`,
        },
        { status: 400 }
      );
    }
    for (const id of catalogIds) {
      if (!UUID_RE.test(id)) {
        return NextResponse.json(
          { error: "validation_error", message: "catalog_id must be a UUID" },
          { status: 400 }
        );
      }
    }

    const result = await listAccessibleSources(
      authResult.workspaceId,
      botId,
      authResult.scopeToWorkspace,
      {
        cursor: cursorParam,
        limit,
        domain,
        pathPrefix,
        catalogIds: catalogIds.length > 0 ? catalogIds : undefined,
      }
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
