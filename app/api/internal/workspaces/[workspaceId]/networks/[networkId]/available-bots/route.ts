import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import {
  getNetworkById,
  getNetworkDerivedBotIds,
} from "@/lib/db/queries/networks";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/networks/:networkId/available-bots
 *
 * Returns the bots derivable from the network (i.e. referenced by at least
 * one accepted catalogue via catalog_bots). Used by the API key creation UI
 * to populate the bot dropdown.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; networkId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, networkId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const network = await getNetworkById(networkId);
    if (!network || network.workspace_id !== auth.workspace.workspaceId) {
      return NextResponse.json({ error: "Network not found" }, { status: 404 });
    }

    const botIds = await getNetworkDerivedBotIds(networkId);
    if (botIds.length === 0) {
      return NextResponse.json({ bots: [] }, { status: 200 });
    }

    // Hydrate bot metadata for the dropdown.
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("bots")
      .select("id, public_id, name, ua_pattern, type")
      .in("id", botIds)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Internal server error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ bots: data ?? [] }, { status: 200 });
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
