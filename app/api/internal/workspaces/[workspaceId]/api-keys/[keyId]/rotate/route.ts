import { NextRequest, NextResponse } from "next/server";
import { rotateApiKey } from "@/lib/services/api-key.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * POST /api/internal/workspaces/:workspaceId/api-keys/:keyId/rotate
 * Regenerate the secret on an existing API key. Returns the new plaintext key
 * once. The row stays in place — same (subscription, access_settings, bot).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; keyId: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param, keyId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const result = await rotateApiKey(
      auth.workspace.workspaceId,
      auth.workspace.userId,
      keyId,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
