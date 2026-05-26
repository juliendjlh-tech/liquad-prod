import { NextRequest, NextResponse } from "next/server";
import { regenerateGatewayKey } from "@/lib/services/gateway.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * POST /api/internal/workspaces/:workspaceId/gateways/:gatewayId/regenerate-key
 * Owner-only key rotation. Returns the new plaintext key, shown once.
 * The previous key is invalidated immediately and breaks live SDK deployments.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; gatewayId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, gatewayId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const apiKey = await regenerateGatewayKey(workspaceId, userId, gatewayId);
    return NextResponse.json({ api_key: apiKey }, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
