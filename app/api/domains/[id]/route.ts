import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import {
  getDomainDeleteImpact,
  deleteDomain,
} from "@/lib/services/content.service";

/**
 * GET /api/domains/:id/impact
 * → handled via query param ?impact=true
 *
 * DELETE /api/domains/:id
 *
 * Delete a domain with catalog cleanup.
 * Contents are cascade-deleted. Catalogs referencing this domain
 * have their filter_rules cleaned (domain_id removed).
 */

async function authCheck(request: NextRequest, workspaceId: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  return membership ? user : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: domainId } = await params;
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const user = await authCheck(request, workspaceId);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const impact = await getDomainDeleteImpact(domainId, workspaceId);
    if (!impact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(impact);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: domainId } = await params;
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const user = await authCheck(request, workspaceId);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deleted = await deleteDomain(domainId, workspaceId);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: domainId });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
