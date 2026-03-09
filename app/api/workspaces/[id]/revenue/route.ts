import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/workspaces/:id/revenue?period=30d
 *
 * Returns revenue metrics for a publisher workspace.
 * Authentication: Session cookie (middleware-protected).
 *
 * Query params:
 * - period: "7d" | "30d" | "90d" (default "30d")
 *
 * RESPONSE (200):
 * {
 *   total_revenue_eur: number,
 *   total_paid_accesses: number,
 *   top_contents: Array<{ url, access_count, total_eur }>,
 *   top_consumers: Array<{ workspace_id, total_eur }>
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;
    const supabase = await createServerClient();

    // Verify user has access to this workspace
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Parse period
    const periodParam = request.nextUrl.searchParams.get("period") ?? "30d";
    const periodDays = periodParam === "7d" ? 7 : periodParam === "90d" ? 90 : 30;
    const periodStart = new Date(
      Date.now() - periodDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // Query debit transactions where this workspace is the publisher
    const { data: debits } = await supabase
      .from("credit_transactions")
      .select(
        "amount_eur, content_url, consumer_workspace_id, created_at"
      )
      .eq("publisher_workspace_id", workspaceId)
      .eq("type", "debit")
      .gte("created_at", periodStart);

    const transactions = debits ?? [];

    // Aggregate totals
    const totalRevenueEur = transactions.reduce(
      (sum, t) => sum + Math.abs(Number(t.amount_eur)),
      0
    );

    // Top contents by revenue
    const contentMap = new Map<
      string,
      { access_count: number; total_eur: number }
    >();
    for (const t of transactions) {
      const url = t.content_url ?? "unknown";
      const existing = contentMap.get(url) ?? { access_count: 0, total_eur: 0 };
      existing.access_count += 1;
      existing.total_eur += Math.abs(Number(t.amount_eur));
      contentMap.set(url, existing);
    }
    const topContents = [...contentMap.entries()]
      .sort((a, b) => b[1].total_eur - a[1].total_eur)
      .slice(0, 10)
      .map(([url, data]) => ({
        url,
        access_count: data.access_count,
        total_eur: Math.round(data.total_eur * 100) / 100,
      }));

    // Top consumers by spending
    const consumerMap = new Map<string, number>();
    for (const t of transactions) {
      const cid = t.consumer_workspace_id;
      consumerMap.set(cid, (consumerMap.get(cid) ?? 0) + Math.abs(Number(t.amount_eur)));
    }
    const topConsumers = [...consumerMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([workspace_id, total_eur]) => ({
        workspace_id,
        total_eur: Math.round(total_eur * 100) / 100,
      }));

    return NextResponse.json({
      total_revenue_eur: Math.round(totalRevenueEur * 100) / 100,
      total_paid_accesses: transactions.length,
      top_contents: topContents,
      top_consumers: topConsumers,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
