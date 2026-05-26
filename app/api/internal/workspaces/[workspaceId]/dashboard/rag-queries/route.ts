import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/dashboard/rag-queries
 *
 * Returns paginated RAG query logs for the consumer workspace.
 *
 * QUERY PARAMS:
 * - page (default 1)
 * - limit (default 20, max 100)
 * - days (default 30) — filter to last N days
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const supabase = await createServerClient();

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10))
    );
    const days = Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10));

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const { count } = await supabase
      .from("rag_query_logs")
      .select("id", { count: "exact", head: true })
      .eq("consumer_workspace_id", workspaceId)
      .gte("created_at", sinceDate.toISOString());

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

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
