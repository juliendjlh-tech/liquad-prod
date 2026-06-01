import { NextRequest, NextResponse } from "next/server";
import { removeCatalog } from "@/lib/services/access-settings.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * DELETE /api/internal/workspaces/:workspaceId/access-settings/:id/catalogs/:catalogId
 * Remove a catalogue from an access settings.
 */
export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ workspaceId: string; id: string; catalogId: string }>;
  },
): Promise<NextResponse> {
  try {
    const { workspaceId: param, id, catalogId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const removed = await removeCatalog({
      workspaceId: auth.workspace.workspaceId,
      id,
      catalogId,
    });
    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true }, { status: 200 });
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
