import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/dashboard/rag-queries
 *
 * Returns paginated RAG query logs for the current workspace.
 * Used by the consumer dashboard to show query history.
 *
 * QUERY PARAMS:
 * - page (default 1)
 * - limit (default 20, max 100)
 * - days (default 30) — filter to last N days
 *
 * HEADERS:
 * - x-workspace-id: UUID of the consumer workspace
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse query params
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10))
    );
    const days = Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10));

    // Calculate date filter
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Count total matching rows for pagination
    const { count } = await supabase
      .from("rag_query_logs")
      .select("id", { count: "exact", head: true })
      .eq("consumer_workspace_id", workspaceId)
      .gte("created_at", sinceDate.toISOString());

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Fetch the query logs (paginated).
    // result_count is no longer a column — computed from results JSONB client-side.
    const { data: logs, error } = await supabase
      .from("rag_query_logs")
      .select("id, query_text, total_cost_eur, results, created_at")
      .eq("consumer_workspace_id", workspaceId)
      .gte("created_at", sinceDate.toISOString())
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch query logs" },
        { status: 500 }
      );
    }

    // Compute aggregate stats server-side for the full period (not just the current page).
    // total_cost_eur is still a column, so SUM is efficient.
    // result_count is derived from jsonb_array_length(results) — acceptable perf at <100K rows.
    const { data: aggregates } = await supabase
      .from("rag_query_logs")
      .select("total_cost_eur, results")
      .eq("consumer_workspace_id", workspaceId)
      .gte("created_at", sinceDate.toISOString());

    const totalResults = (aggregates ?? []).reduce((sum, r) => {
      if (!r.results || !Array.isArray(r.results)) return sum;
      return sum + r.results.length;
    }, 0);
    const totalSpentEur = (aggregates ?? []).reduce((sum, r) => sum + r.total_cost_eur, 0);

    // Map logs to include result_count computed from JSONB for display
    const items = (logs ?? []).map((log) => ({
      ...log,
      result_count: Array.isArray(log.results) ? log.results.length : 0,
    }));

    return NextResponse.json({
      items,
      total,
      page,
      totalPages,
      totalResults,
      totalSpentEur,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
