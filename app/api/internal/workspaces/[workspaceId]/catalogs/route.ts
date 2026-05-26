import { NextRequest, NextResponse } from "next/server";
import { createCatalogSchema } from "@/lib/validations/catalog.schema";
import { createCatalog, getCatalogs } from "@/lib/services/catalog.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/catalogs
 * List all catalogs for a workspace, ordered by created_at ASC.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const catalogs = await getCatalogs(workspaceId);
    return NextResponse.json(catalogs, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/workspaces/:workspaceId/catalogs
 *
 * Create a new catalog with URL patterns, authorized bots, and pricing.
 * New catalogs always start with status "inactive".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const body = await request.json();
    const validation = createCatalogSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const catalog = await createCatalog(workspaceId, validation.data);
    return NextResponse.json(catalog, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_BOT_IDS") {
      return NextResponse.json(
        { error: "bot_ids contains invalid or unauthorized bot IDs" },
        { status: 400 }
      );
    }
    if (err instanceof Error && err.message === "INVALID_DOMAIN_IDS") {
      return NextResponse.json(
        { error: "filter_rules contains domain_ids not belonging to this workspace" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
