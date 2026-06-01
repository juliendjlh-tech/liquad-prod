import { NextRequest, NextResponse } from "next/server";
import { listEligibleCatalogsForBot } from "@/lib/services/access-settings.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/bots/:botId/eligible-catalogs
 *
 * Returns the catalogues a given bot can consume (marketplace-active only),
 * decorated with the columns the plan-creation page needs: domains, source
 * count, current publisher price.
 *
 * Used by the new plan flow (`/dashboard/access/plans/new`) where we don't
 * have an access_settings yet — the consumer is shopping for catalogues
 * before committing.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; botId: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param, botId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const catalogs = await listEligibleCatalogsForBot({
      workspaceId: auth.workspace.workspaceId,
      botId,
    });
    return NextResponse.json({ catalogs }, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
