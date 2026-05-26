import { NextRequest, NextResponse } from "next/server";
import { getDashboardMetrics } from "@/lib/services/dashboard.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

const ALLOWED_PERIODS = [7, 30, 90];

/**
 * GET /api/internal/workspaces/:workspaceId/dashboard/metrics?period=30
 *
 * Query params:
 *   - period: optional, default 30 (days). Allowed: 7, 30, 90
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

    const periodParam = request.nextUrl.searchParams.get("period") ?? "30";
    const period = parseInt(periodParam, 10);

    if (!ALLOWED_PERIODS.includes(period)) {
      return NextResponse.json(
        { error: "period must be 7, 30, or 90" },
        { status: 400 }
      );
    }

    const metrics = await getDashboardMetrics(workspaceId, period);
    return NextResponse.json(metrics, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
