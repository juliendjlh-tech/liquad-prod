import { NextRequest, NextResponse } from "next/server";
import { getRecommendedBots } from "@/lib/services/recommended-bots.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/bots/recommended
 *
 * Curated MVP list of preset bots surfaced in the "Add integration" picker.
 * Workspace membership is required but the response is the same for every
 * caller (the list is global).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const bots = await getRecommendedBots();
    return NextResponse.json(bots, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
