import { NextRequest, NextResponse } from "next/server";
import { listIntegrations } from "@/lib/services/integrations.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/integrations
 * List bots active in the workspace with plan / subscription / key counts.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const items = await listIntegrations(auth.workspace.workspaceId);
    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_MEMBER") {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
