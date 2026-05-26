import { NextRequest, NextResponse } from "next/server";
import { inviteNetworkCatalogsSchema } from "@/lib/validations/network.schema";
import {
  getNetworkById,
  inviteCatalogs,
} from "@/lib/db/queries/networks";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * POST /api/internal/workspaces/:workspaceId/networks/:networkId/invites
 *
 * Invite one or more catalogues into this network. Catalogues belonging to
 * the network's workspace are auto-accepted (handled by inviteCatalogs).
 * Body: { catalog_ids: uuid[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; networkId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, networkId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const network = await getNetworkById(networkId);
    if (!network || network.workspace_id !== auth.workspace.workspaceId) {
      return NextResponse.json({ error: "Network not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = inviteNetworkCatalogsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const inserted = await inviteCatalogs({
      networkId,
      catalogIds: parsed.data.catalog_ids,
      invitedBy: auth.workspace.userId,
    });

    return NextResponse.json({ invited: inserted }, { status: 201 });
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
