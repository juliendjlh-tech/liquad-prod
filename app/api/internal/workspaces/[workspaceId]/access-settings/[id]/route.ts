import { NextRequest, NextResponse } from "next/server";
import { updateAccessSettingsSchema } from "@/lib/validations/access-settings.schema";
import {
  deleteForWorkspace,
  getDetail,
  updateForWorkspace,
} from "@/lib/services/access-settings.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET    /api/internal/workspaces/:workspaceId/access-settings/:id
 * PATCH  /api/internal/workspaces/:workspaceId/access-settings/:id
 * DELETE /api/internal/workspaces/:workspaceId/access-settings/:id
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param, id } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const detail = await getDetail(auth.workspace.workspaceId, id);
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(detail, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param, id } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = updateAccessSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const updated = await updateForWorkspace({
      workspaceId: auth.workspace.workspaceId,
      id,
      patch: {
        name: parsed.data.name,
        maxPriceEur: parsed.data.max_price_eur,
      },
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param, id } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const deleted = await deleteForWorkspace({
      workspaceId: auth.workspace.workspaceId,
      id,
    });
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, id }, { status: 200 });
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
    if (err.message === "ACCESS_SETTINGS_IN_USE") {
      return NextResponse.json(
        {
          error: "access_settings_in_use",
          message:
            "Revoke or rotate every API key bound to this plan before deleting it.",
        },
        { status: 422 },
      );
    }
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
