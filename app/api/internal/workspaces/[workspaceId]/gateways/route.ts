import { NextRequest, NextResponse } from "next/server";
import {
  createGateway,
  listGateways,
} from "@/lib/services/gateway.service";
import { createGatewaySchema } from "@/lib/validations/gateway.schema";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/gateways
 * List gateways for a workspace (owner/admin/member).
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

    const gateways = await listGateways(workspaceId, userId);
    return NextResponse.json(gateways, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * POST /api/internal/workspaces/:workspaceId/gateways
 * Create a gateway. Returns the plaintext API key once.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const body = await request.json().catch(() => null);
    const parsed = createGatewaySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const created = await createGateway(workspaceId, userId, {
      label: parsed.data.label ?? null,
      catalogPublicIds: parsed.data.catalog_ids ?? [],
    });

    return NextResponse.json(created, { status: 201 });
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
    if (err.message === "INVALID_CATALOG_IDS") {
      return NextResponse.json(
        { error: "invalid_catalog_ids" },
        { status: 422 }
      );
    }
  }
  console.error("[POST /gateways] unhandled error:", err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
