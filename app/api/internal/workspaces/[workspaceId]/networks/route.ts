import { NextRequest, NextResponse } from "next/server";
import { createNetworkSchema } from "@/lib/validations/network.schema";
import {
  createNetwork,
  listNetworks,
} from "@/lib/db/queries/networks";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/networks
 * List networks owned by this workspace.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const networks = await listNetworks(auth.workspace.workspaceId);
    return NextResponse.json(networks, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * POST /api/internal/workspaces/:workspaceId/networks
 * Create a new network owned by this workspace (owner/admin only).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    // assertRole via RLS at INSERT time; we still require membership here.

    const body = await request.json().catch(() => null);
    const parsed = createNetworkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const network = await createNetwork({
      workspaceId: auth.workspace.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    });

    return NextResponse.json(network, { status: 201 });
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
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
