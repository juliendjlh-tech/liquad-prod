import { NextRequest, NextResponse } from "next/server";
import { getPresetBots } from "@/lib/services/agent.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/bots/presets
 *
 * Platform preset bots (type = 'preset'), enriched with the operator field
 * from the in-memory AI_BOT_PRESETS list. Used by the preset picker so
 * workspace members can subscribe to them.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const presets = await getPresetBots();
    return NextResponse.json(presets, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
