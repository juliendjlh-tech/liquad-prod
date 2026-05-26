import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceById } from "@/lib/services/workspace.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId
 *
 * Get detailed information about a specific workspace.
 * Accepts either the workspace `public_id` (wks_xxx) or raw UUID.
 *
 * Returns 404 (not 403) when the user is not a member to avoid leaking
 * workspace existence.
 *
 * RESPONSE:
 * - 200: `{ id, name, role, created_at, domain_count, member_count }`
 * - 401: Unauthorized
 * - 404: Workspace not found or user is not a member
 * - 500: Internal server error
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const workspace = await getWorkspaceById(workspaceId, userId);

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(workspace, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
