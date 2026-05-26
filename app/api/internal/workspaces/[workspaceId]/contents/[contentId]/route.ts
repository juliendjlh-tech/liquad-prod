import { NextRequest, NextResponse } from "next/server";
import { deleteSource } from "@/lib/services/content.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * DELETE /api/internal/workspaces/:workspaceId/contents/:contentId
 *
 * Delete a single content record. Scoped to the workspace; returns 404 if
 * the content belongs to a different one.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; contentId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, contentId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const deleted = await deleteSource(contentId, workspaceId);

    if (!deleted) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Content not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ deleted: true, id: contentId }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
