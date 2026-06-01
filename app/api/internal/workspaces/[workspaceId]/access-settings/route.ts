import { NextRequest, NextResponse } from "next/server";
import {
  createAccessSettingsSchema,
} from "@/lib/validations/access-settings.schema";
import {
  createForWorkspace,
  deleteForWorkspace,
  listForWorkspace,
} from "@/lib/services/access-settings.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";
import { z } from "zod";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * GET    /api/internal/workspaces/:workspaceId/access-settings
 * POST   /api/internal/workspaces/:workspaceId/access-settings
 * DELETE /api/internal/workspaces/:workspaceId/access-settings   — bulk
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const items = await listForWorkspace(auth.workspace.workspaceId);
    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = createAccessSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const created = await createForWorkspace({
      workspaceId: auth.workspace.workspaceId,
      name: parsed.data.name,
      botId: parsed.data.bot_id,
      maxPriceEur: parsed.data.max_price_eur ?? null,
      catalogIds: parsed.data.catalog_ids,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = bulkDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const deleted: string[] = [];
    const blocked: Array<{ id: string; reason: string }> = [];

    // Sequential to keep error mapping per-id readable.
    for (const id of parsed.data.ids) {
      try {
        const ok = await deleteForWorkspace({
          workspaceId: auth.workspace.workspaceId,
          id,
        });
        if (ok) deleted.push(id);
        else blocked.push({ id, reason: "not_found" });
      } catch (err) {
        if (err instanceof Error && err.message === "ACCESS_SETTINGS_IN_USE") {
          blocked.push({ id, reason: "in_use_by_api_keys" });
        } else {
          blocked.push({
            id,
            reason: err instanceof Error ? err.message : "unknown",
          });
        }
      }
    }

    return NextResponse.json({ deleted, blocked }, { status: 200 });
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
    if (err.message === "BOT_NOT_FOUND") {
      return NextResponse.json(
        { error: "bot_not_found" },
        { status: 404 },
      );
    }
    // Trigger raises with check_violation; surface a friendlier label.
    if (err.message.includes("bot_not_in_workspace")) {
      return NextResponse.json(
        { error: "bot_not_in_workspace" },
        { status: 422 },
      );
    }
    if (err.message.includes("catalog_not_eligible")) {
      return NextResponse.json(
        {
          error: "catalog_not_eligible",
          message:
            "One catalogue is neither on the marketplace nor owned by this workspace.",
        },
        { status: 422 },
      );
    }
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
