import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import {
  getCatalogById,
  previewCatalogMatch,
} from "@/lib/services/catalog.service";

/**
 * GET /api/catalogs/:id/preview
 *
 * Preview content matching for an existing catalog.
 * Uses the catalog's url_patterns to test against workspace contents.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * QUERY PARAMS:
 * - page (optional): Page number, default 1
 * - limit (optional): Items per page, default 50, max 100
 *
 * RESPONSES:
 * - 200: PreviewResult with matched_contents and warnings
 * - 400: Missing header
 * - 401: Unauthorized
 * - 404: Catalog not found or wrong workspace
 * - 500: Internal server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: catalogId } = await params;
    const workspaceId = request.headers.get("x-workspace-id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get catalog to verify ownership and get url_patterns
    const catalog = await getCatalogById(catalogId, workspaceId);

    if (!catalog) {
      return NextResponse.json(
        { error: "catalog not found" },
        { status: 404 }
      );
    }

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    const result = await previewCatalogMatch(
      workspaceId,
      catalog.url_patterns,
      page,
      limit
    );

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
