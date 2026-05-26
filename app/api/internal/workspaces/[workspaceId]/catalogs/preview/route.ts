import { NextRequest, NextResponse } from "next/server";
import { previewFilterRulesSchema } from "@/lib/validations/catalog.schema";
import {
  getCatalogById,
  previewCatalogMatch,
} from "@/lib/services/catalog.service";
import {
  requireWorkspaceMembership,
  resolveResourceId,
} from "@/lib/services/workspace-resolver";

/**
 * POST /api/internal/workspaces/:workspaceId/catalogs/preview
 *
 * Preview content matching filter rules. The body MUST contain exactly one of:
 *   - `filter_rules`: ad-hoc rules to test (creation flow)
 *   - `catalog_id`:   the catalog public_id whose saved rules should be used
 *
 * QUERY PARAMS:
 * - page (optional): 1-based, default 1
 * - limit (optional): default 50, max 100
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
    const validation = previewFilterRulesSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    let filterRules = validation.data.filter_rules;

    if (!filterRules) {
      const catalogId = await resolveResourceId("catalogs", validation.data.catalog_id!);
      if (!catalogId) {
        return NextResponse.json({ error: "catalog not found" }, { status: 404 });
      }
      const catalog = await getCatalogById(catalogId, workspaceId);
      if (!catalog) {
        return NextResponse.json({ error: "catalog not found" }, { status: 404 });
      }
      filterRules = catalog.filter_rules;
    }

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    const result = await previewCatalogMatch(workspaceId, filterRules, page, limit);

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
