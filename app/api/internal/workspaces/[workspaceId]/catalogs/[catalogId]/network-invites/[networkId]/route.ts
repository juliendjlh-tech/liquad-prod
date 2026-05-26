import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { respondToNetworkInviteSchema } from "@/lib/validations/network.schema";
import { respondToNetworkInvite } from "@/lib/db/queries/networks";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * PATCH /api/internal/workspaces/:workspaceId/catalogs/:catalogId/network-invites/:networkId
 *
 * Accept or revoke a network invite. Authorized only for the catalogue's
 * workspace owners/admins (enforced by RLS catalog_admins_respond_to_invites).
 *
 * Body: { action: 'accept' | 'revoke' }
 */
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ workspaceId: string; catalogId: string; networkId: string }>;
  }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, catalogId, networkId } = await params;
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

    const body = await request.json().catch(() => null);
    const parsed = respondToNetworkInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const updated = await respondToNetworkInvite({
      networkId,
      catalogId,
      accept: parsed.data.action === "accept",
    });

    if (!updated) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
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
