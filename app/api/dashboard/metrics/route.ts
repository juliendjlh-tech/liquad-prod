import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { getDashboardMetrics } from "@/lib/services/dashboard.service";

const ALLOWED_PERIODS = [7, 30, 90];

/**
 * GET /api/dashboard/metrics?workspace_id=...&period=30
 *
 * Query params:
 *   - workspace_id: required
 *   - period: optional, default 30 (days). Allowed: 7, 30, 90
 *
 * RESPONSES:
 * - 200: DashboardMetrics
 * - 400: Missing or invalid params
 * - 401: Unauthorized
 * - 403: Not a workspace member
 * - 500: Internal server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id query param is required" },
        { status: 400 }
      );
    }

    const periodParam = searchParams.get("period") ?? "30";
    const period = parseInt(periodParam, 10);

    if (!ALLOWED_PERIODS.includes(period)) {
      return NextResponse.json(
        { error: "period must be 7, 30, or 90" },
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

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
