import { NextRequest, NextResponse } from "next/server";
import { updateCatalogSchema } from "@/lib/validations/catalog.schema";
import {
  getCatalogById,
  updateCatalog,
  deleteCatalog,
} from "@/lib/services/catalog.service";
import {
  requireWorkspaceMembership,
  resolveResourceId,
} from "@/lib/services/workspace-resolver";

async function resolveCatalogId(param: string): Promise<string | null> {
  return resolveResourceId("catalogs", param);
}

/**
 * GET /api/internal/workspaces/:workspaceId/catalogs/:catalogId
 * Get catalog detail with linked bots.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; catalogId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: wsParam, catalogId: catParam } = await params;
    const auth = await requireWorkspaceMembership(wsParam);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const catalogId = await resolveCatalogId(catParam);
    if (!catalogId) {
      return NextResponse.json({ error: "catalog not found" }, { status: 404 });
    }

    const catalog = await getCatalogById(catalogId, workspaceId);

    if (!catalog) {
      return NextResponse.json({ error: "catalog not found" }, { status: 404 });
    }

    return NextResponse.json(catalog, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/internal/workspaces/:workspaceId/catalogs/:catalogId
 *
 * Partial update for name, description, filter_rules, bot_ids, price_eur,
 * status, rag_enabled. Activating a catalog without a verified domain
 * succeeds but returns a warning.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; catalogId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: wsParam, catalogId: catParam } = await params;
    const auth = await requireWorkspaceMembership(wsParam);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const catalogId = await resolveCatalogId(catParam);
    if (!catalogId) {
      return NextResponse.json({ error: "catalog not found" }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateCatalogSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const updated = await updateCatalog(catalogId, workspaceId, validation.data);

    if (!updated) {
      return NextResponse.json({ error: "catalog not found" }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
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

/**
 * DELETE /api/internal/workspaces/:workspaceId/catalogs/:catalogId
 * Delete a catalog. Cascade removes catalog_bots entries.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; catalogId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: wsParam, catalogId: catParam } = await params;
    const auth = await requireWorkspaceMembership(wsParam);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const catalogId = await resolveCatalogId(catParam);
    if (!catalogId) {
      return NextResponse.json({ error: "catalog not found" }, { status: 404 });
    }

    const deleted = await deleteCatalog(catalogId, workspaceId);

    if (!deleted) {
      return NextResponse.json({ error: "catalog not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
