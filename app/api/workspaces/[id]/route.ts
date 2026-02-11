import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { getWorkspaceById } from "@/lib/services/workspace.service";

/**
 * GET /api/workspaces/:id
 *
 * Get detailed information about a specific workspace.
 * Only accessible to members of the workspace.
 *
 * Returns workspace details including the user's role and aggregate counts
 * (domain_count, member_count) useful for the dashboard header.
 *
 * The API key is NEVER included (security — it's only shown at creation).
 *
 * NON-MEMBER BEHAVIOR:
 * Returns 404 (not 403) when the user is not a member. This prevents
 * information leakage — an attacker cannot determine whether a workspace
 * exists by probing IDs.
 *
 * RESPONSE:
 * - 200: `{ id, name, role, created_at, domain_count, member_count }`
 * - 401: Unauthorized (handled by middleware)
 * - 404: Workspace not found or user is not a member
 * - 500: Internal server error
 *
 * @see {@link getWorkspaceById} for the service layer implementation
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // getWorkspaceById returns null if the workspace doesn't exist
    // or if the user is not a member — both cases return 404
    const workspace = await getWorkspaceById(workspaceId, user.id);

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(workspace, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
