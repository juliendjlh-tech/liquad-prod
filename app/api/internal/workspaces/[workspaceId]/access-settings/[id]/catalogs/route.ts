import { NextRequest, NextResponse } from "next/server";
import { addCatalogsSchema } from "@/lib/validations/access-settings.schema";
import { addCatalogs } from "@/lib/services/access-settings.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * POST /api/internal/workspaces/:workspaceId/access-settings/:id/catalogs
 * Append catalogues to an existing access settings (idempotent).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param, id } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = addCatalogsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const updated = await addCatalogs({
      workspaceId: auth.workspace.workspaceId,
      id,
      catalogIds: parsed.data.catalog_ids,
    });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (err.message.includes("catalog_not_eligible")) {
        return NextResponse.json(
          { error: "catalog_not_eligible" },
          { status: 422 },
        );
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
