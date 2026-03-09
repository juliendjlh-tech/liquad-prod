import { NextRequest, NextResponse } from "next/server";
import { authenticateSdkRequest } from "@/lib/services/sdk-auth.service";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/sdk/transactions
 *
 * Returns paginated transaction history for the authenticated workspace.
 * Cursor-based pagination using base64url-encoded created_at|id.
 *
 * Query params:
 * - limit: 1-100 (default 50)
 * - cursor: opaque string from previous response's next_cursor
 *
 * Authentication: API key via Authorization: Bearer <key>
 *
 * RESPONSE (200):
 * {
 *   items: Array<{ id, type, amount_eur, content_url, publisher_workspace_id, created_at }>,
 *   next_cursor: string | null,
 *   has_more: boolean
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth API key
    const authHeader = request.headers.get("authorization");
    const authResult = await authenticateSdkRequest(authHeader);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // 2. Parse query params
    const { searchParams } = request.nextUrl;
    const limitParam = parseInt(searchParams.get("limit") ?? "50", 10);
    const cursor = searchParams.get("cursor");

    if (isNaN(limitParam) || limitParam < 1 || limitParam > 100) {
      return NextResponse.json(
        { error: "limit must be between 1 and 100" },
        { status: 422 }
      );
    }

    const supabase = await createServerClient();

    // 3. Build query with cursor-based pagination
    let query = supabase
      .from("credit_transactions")
      .select(
        "id, type, amount_eur, content_url, publisher_workspace_id, created_at"
      )
      .eq("consumer_workspace_id", authResult.workspaceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limitParam + 1); // +1 to detect has_more

    // 4. Decode cursor and apply filter
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64url").toString();
        const separatorIndex = decoded.lastIndexOf("|");
        if (separatorIndex === -1) throw new Error("invalid cursor");
        const cursorCreatedAt = decoded.slice(0, separatorIndex);
        const cursorId = decoded.slice(separatorIndex + 1);

        // (created_at, id) < (cursor_created_at, cursor_id) for DESC order
        query = query.or(
          `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
        );
      } catch {
        return NextResponse.json(
          { error: "invalid_cursor" },
          { status: 422 }
        );
      }
    }

    const { data: items, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "internal_error" },
        { status: 500 }
      );
    }

    // 5. Detect has_more and build next_cursor
    const results = items ?? [];
    const hasMore = results.length > limitParam;
    if (hasMore) results.pop();

    const nextCursor =
      hasMore && results.length > 0
        ? Buffer.from(
            `${results[results.length - 1].created_at}|${results[results.length - 1].id}`
          ).toString("base64url")
        : null;

    // 6. Return paginated response
    return NextResponse.json({
      items: results.map((t) => ({
        ...t,
        amount_eur: Number(t.amount_eur),
      })),
      next_cursor: nextCursor,
      has_more: hasMore,
    });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
