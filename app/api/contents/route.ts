import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { getSources } from "@/lib/services/content.service";

/**
 * GET /api/contents
 *
 * List imported contents for a workspace with pagination and search.
 *
 * QUERY PARAMETERS:
 * - workspace_id (required): UUID of the workspace
 * - page (optional): Page number, default 1
 * - limit (optional): Items per page, default 50, max 100
 * - search (optional): Filter by source_url substring (case-insensitive)
 *
 * RESPONSES:
 * - 200: `{ items, total, page, totalPages }`
 * - 400: Missing workspace_id
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
 * - 500: Internal server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;

    // Extract and validate workspace_id
    const workspaceId = searchParams.get("workspace_id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "workspace_id is required" },
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

    // Verify workspace membership
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

    // Parse pagination params
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const search = searchParams.get("search") ?? undefined;
    const domain = searchParams.get("domain") ?? undefined;
    const domainId = searchParams.get("domain_id") ?? undefined;

    const result = await getSources({ workspaceId, page, limit, search, domain, domainId });

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
