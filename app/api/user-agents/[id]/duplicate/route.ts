import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { duplicateUserAgent } from "@/lib/services/user-agent.service";

/**
 * POST /api/user-agents/:id/duplicate
 *
 * Duplicate a user-agent as a custom bot (is_preset = false).
 * The new bot gets a unique name like "OriginalName (copy)".
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 201: The newly created custom bot
 * - 400: Missing header
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
 * - 404: Source bot not found or wrong workspace
 * - 500: Internal server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: userAgentId } = await params;
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

    const duplicated = await duplicateUserAgent(userAgentId, workspaceId);

    if (!duplicated) {
      return NextResponse.json(
        { error: "User-agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(duplicated, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
