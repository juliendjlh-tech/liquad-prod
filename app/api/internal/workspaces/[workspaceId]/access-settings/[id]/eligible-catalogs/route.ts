import { NextRequest, NextResponse } from "next/server";
import { listEligibleCatalogs } from "@/lib/services/access-settings.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/access-settings/:id/eligible-catalogs
 *
 * Catalogues the consumer can attach to this access settings:
 *   - marketplace (status=active) from any workspace, OR
 *   - private (status=inactive) from the consumer's own workspace.
 *
 * Each candidate is decorated with the IP whitelist / non-whitelist relative
 * to the plan's bot so the UI can highlight which consumer IPs would be
 * accepted by the publisher.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param, id } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const catalogs = await listEligibleCatalogs({
      workspaceId: auth.workspace.workspaceId,
      accessSettingsId: id,
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
