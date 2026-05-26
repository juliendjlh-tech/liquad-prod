import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { listAccessibleSources, SOURCES_LIMITS } from "@/lib/services/consumer.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE = /^[a-zA-Z0-9.-]+$/;
// Path prefixes are user-supplied LIKE arguments; we only accept printable ASCII
// without control chars / whitespace.
const PATH_PREFIX_RE = /^[\x21-\x7E]+$/;

/**
 * GET /api/public/v1/consumer/sources
 *
 * Discovery endpoint. List indexed URLs the caller's API key can reach,
 * i.e. URLs covered by an accepted catalogue in the key's network whose bot
 * allowlist matches the key's bot identity.
 *
 * Authentication: API key via Authorization: Bearer <key>. bot_id and network
 * are no longer URL params — both come from the key.
 *
 * QUERY PARAMS (all optional):
 * - cursor: opaque UUID from previous response's `next_cursor`
 * - limit: 1..5000, default 1000
 * - domain: hostname filter
 * - path_prefix: URL path prefix
 * - catalog_id: repeatable, restricts to a subset of accessible catalogues
 *
 * RESPONSES:
 * - 200: { sources: [...], next_cursor: string | null }
 * - 400: invalid query param
 * - 401: invalid API key
 * - 422: bot missing IPs
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
      authResult.networkId,
      authResult.botId,
      {
        cursor: cursorParam,
        limit,
        domain,
        pathPrefix,
        catalogIds: catalogIds.length > 0 ? catalogIds : undefined,
      },
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
