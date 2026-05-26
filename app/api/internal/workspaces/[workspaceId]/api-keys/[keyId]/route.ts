import { NextRequest, NextResponse } from "next/server";
import { revokeApiKey } from "@/lib/services/api-key.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * DELETE /api/internal/workspaces/:workspaceId/api-keys/:keyId
 * Revoke a consumer API key (owner/admin only).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; keyId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, keyId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    await revokeApiKey(workspaceId, userId, keyId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
