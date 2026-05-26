import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { listInvitesForCatalog } from "@/lib/db/queries/networks";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/catalogs/:catalogId/network-invites
 *
 * List network invitations for a catalogue (all statuses). Backs the
 * "Networks" section on the catalogue detail page.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; catalogId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, catalogId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    // Ownership of the catalogue.
    const supabase = await createServerClient();
    const { data: catalog } = await supabase
      .from("catalogs")
      .select("id, workspace_id")
      .eq("id", catalogId)
      .maybeSingle();

    if (!catalog || catalog.workspace_id !== auth.workspace.workspaceId) {
      return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
    }

    const invites = await listInvitesForCatalog(catalogId);
    return NextResponse.json(invites, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
