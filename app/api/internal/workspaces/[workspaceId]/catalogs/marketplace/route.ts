import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/catalogs/marketplace
 *
 * List all catalogs available on the marketplace (status = "active") across
 * workspaces. Each entry carries `is_own_workspace` so the UI can distinguish
 * the caller's own catalogs from network catalogs (other publishers).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("catalogs")
      .select("id, public_id, name, workspace_id, status, price_eur")
      .eq("status", "active")
      .order("workspace_id", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[GET /catalogs/marketplace] db error:", error);
      return NextResponse.json(
        { error: "internal_error", detail: error.message },
        { status: 500 }
      );
    }

    const result = (data ?? []).map((c) => ({
      id: c.id,
      public_id: c.public_id,
      name: c.name,
      status: c.status,
      price_eur: Number(c.price_eur),
      workspace_id: c.workspace_id,
      is_own_workspace: c.workspace_id === workspaceId,
    }));

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[GET /catalogs/marketplace] unhandled:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
