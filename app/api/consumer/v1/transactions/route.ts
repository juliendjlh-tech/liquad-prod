import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/consumer/v1/transactions
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
    const authResult = await authenticateConsumerKey(
      request.headers.get("authorization")
    );
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

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

    let query = supabase
      .from("credit_transactions")
      .select(
        "id, type, amount_eur, content_url, publisher_workspace_id, created_at"
      )
      .eq("bot_subscription_id", authResult.botSubscriptionId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limitParam + 1);

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64url").toString();
        const separatorIndex = decoded.lastIndexOf("|");
        if (separatorIndex === -1) throw new Error("invalid cursor");
        const cursorCreatedAt = decoded.slice(0, separatorIndex);
        const cursorId = decoded.slice(separatorIndex + 1);

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

    const results = items ?? [];
    const hasMore = results.length > limitParam;
    if (hasMore) results.pop();

    const nextCursor =
      hasMore && results.length > 0
        ? Buffer.from(
            `${results[results.length - 1].created_at}|${results[results.length - 1].id}`
          ).toString("base64url")
        : null;

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
