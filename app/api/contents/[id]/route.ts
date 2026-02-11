import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { deleteContent } from "@/lib/services/content.service";

/**
 * DELETE /api/contents/:id
 *
 * Delete a single content record.
 * Only deletes if the content belongs to the caller's workspace.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 200: `{ deleted: true, id }`
 * - 400: Missing x-workspace-id header
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
 * - 404: Content not found (or not in user's workspace)
 * - 500: Internal server error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: contentId } = await params;

    // Extract workspace_id from header
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
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Delete the content
    const deleted = await deleteContent(contentId, workspaceId);

    if (!deleted) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Content not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ deleted: true, id: contentId }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
