import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/contents/index/[jobId]
 *
 * Poll the status of an indexing job.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace (for authorization)
 *
 * RESPONSES:
 * - 200: `{ id, status, result, error_message, created_at, updated_at }`
 * - 400: Missing workspace_id header
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
 * - 404: Job not found or doesn't belong to workspace
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  try {
    const { jobId } = await params;

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

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch job — scoped to workspace for security
    const { data: job, error } = await supabase
      .from("indexing_jobs")
      .select("id, status, result, error_message, sitemap_url, created_at, updated_at")
      .eq("id", jobId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
