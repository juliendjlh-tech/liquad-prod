import { NextRequest, NextResponse } from "next/server";
import {
  deleteGateway,
  updateGateway,
} from "@/lib/services/gateway.service";
import { updateGatewaySchema } from "@/lib/validations/gateway.schema";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * PATCH /api/internal/workspaces/:workspaceId/gateways/:gatewayId
 * Update label and/or catalog allowlist (owner/admin).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; gatewayId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, gatewayId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const body = await request.json().catch(() => null);
    const parsed = updateGatewaySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const updated = await updateGateway(workspaceId, userId, gatewayId, {
      label: parsed.data.label === undefined ? undefined : parsed.data.label,
      catalogPublicIds: parsed.data.catalog_ids,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * DELETE /api/internal/workspaces/:workspaceId/gateways/:gatewayId
 * Delete a gateway. Owner/admin. The key is invalidated immediately.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; gatewayId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, gatewayId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    await deleteGateway(workspaceId, userId, gatewayId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
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
    if (err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
    }
    if (err.message === "INVALID_CATALOG_IDS") {
      return NextResponse.json(
        { error: "invalid_catalog_ids" },
        { status: 422 }
      );
    }
  }
  console.error("[gateways/[id]] unhandled error:", err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
