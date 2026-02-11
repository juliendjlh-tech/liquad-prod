import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { previewPatternsSchema } from "@/lib/validations/catalog.schema";
import { previewCatalogMatch } from "@/lib/services/catalog.service";

/**
 * POST /api/catalogs/preview
 *
 * Ad-hoc preview: test URL patterns against workspace contents
 * before creating a catalog.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * REQUEST BODY (JSON):
 * ```json
 * { "url_patterns": ["/premium/.*", "/vip/.*"] }
 * ```
 *
 * QUERY PARAMS:
 * - page (optional): Page number, default 1
 * - limit (optional): Items per page, default 50, max 100
 *
 * RESPONSES:
 * - 200: PreviewResult with matched_contents and warnings
 * - 400: Validation error (invalid regex, empty patterns)
 * - 401: Unauthorized
 * - 403: User not a member
 * - 500: Internal server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = previewPatternsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
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

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    const result = await previewCatalogMatch(
      workspaceId,
      validation.data.url_patterns,
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
