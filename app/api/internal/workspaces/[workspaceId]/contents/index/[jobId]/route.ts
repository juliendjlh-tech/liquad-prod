import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/contents/index/:jobId
 *
 * Poll the status of an indexing job. Returns 404 if the job belongs to
 * a different workspace.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; jobId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, jobId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const supabase = await createServerClient();
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
