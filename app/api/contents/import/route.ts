import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { importSitemapSchema } from "@/lib/validations/content.schema";
import { importFromSitemap } from "@/lib/services/content.service";

/**
 * POST /api/contents/import
 *
 * Import contents from a sitemap.xml URL into a workspace.
 *
 * REQUEST BODY (JSON):
 * ```json
 * { "url": "https://example.com/sitemap.xml" }
 * ```
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace to import into
 *
 * FLOW:
 * 1. Validate request body with importSitemapSchema (Zod).
 * 2. Extract workspace_id from x-workspace-id header.
 * 3. Verify user is a member of the workspace.
 * 4. Call importFromSitemap(workspaceId, url).
 * 5. Return { imported, created, updated }.
 *
 * RESPONSES:
 * - 200: `{ imported, created, updated }`
 * - 400: Validation error or missing workspace_id header
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
 * - 422: FETCH_FAILED or INVALID_SITEMAP
 * - 500: Internal server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1: Validate request body
    const body = await request.json();
    const validation = importSitemapSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    // Step 2: Extract workspace_id from header
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    // Auth check
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 3: Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Step 4-5: Import and return result
    const result = await importFromSitemap(workspaceId, validation.data.url);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "FETCH_FAILED") {
        return NextResponse.json(
          { error: "FETCH_FAILED", message: "Failed to fetch sitemap" },
          { status: 422 }
        );
      }
      if (err.message === "INVALID_SITEMAP") {
        return NextResponse.json(
          { error: "INVALID_SITEMAP", message: "Failed to parse sitemap XML" },
          { status: 422 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
