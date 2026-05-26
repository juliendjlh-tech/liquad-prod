import { NextRequest, NextResponse } from "next/server";
import { updateNetworkSchema } from "@/lib/validations/network.schema";
import {
  getNetworkWithCatalogs,
  updateNetwork,
  deleteNetwork,
} from "@/lib/db/queries/networks";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/networks/:networkId
 * Returns the network with its catalogue memberships (all statuses).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; networkId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, networkId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const network = await getNetworkWithCatalogs(networkId);
    if (!network || network.workspace_id !== auth.workspace.workspaceId) {
      return NextResponse.json({ error: "Network not found" }, { status: 404 });
    }

    return NextResponse.json(network, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * PATCH /api/internal/workspaces/:workspaceId/networks/:networkId
 * Update name/description.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; networkId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, networkId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const network = await getNetworkWithCatalogs(networkId);
    if (!network || network.workspace_id !== auth.workspace.workspaceId) {
      return NextResponse.json({ error: "Network not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateNetworkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const updated = await updateNetwork(networkId, {
      name: parsed.data.name,
      description: parsed.data.description,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * DELETE /api/internal/workspaces/:workspaceId/networks/:networkId
 * Cascades to network_catalogs. Active API keys referencing the network are
 * protected by ON DELETE RESTRICT — the delete will fail until they are revoked.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; networkId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, networkId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const network = await getNetworkWithCatalogs(networkId);
    if (!network || network.workspace_id !== auth.workspace.workspaceId) {
      return NextResponse.json({ error: "Network not found" }, { status: 404 });
    }

    await deleteNetwork(networkId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("violates foreign key")) {
      return NextResponse.json(
        { error: "network_in_use", message: "Revoke API keys referencing this network first." },
        { status: 409 }
      );
    }
    return mapError(err);
  }
}

function mapError(err: unknown): NextResponse {
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
