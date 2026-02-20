import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { getDomainsWithContentCount } from "@/lib/services/content.service";

/**
 * GET /api/domains
 *
 * List domains for a workspace with content counts.
 *
 * QUERY PARAMETERS:
 * - workspace_id (required): UUID of the workspace
 * - search (optional): Filter by domain name substring
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;

    const workspaceId = searchParams.get("workspace_id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "workspace_id is required" },
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

    const search = searchParams.get("search") ?? undefined;
    const domains = await getDomainsWithContentCount(workspaceId, search);

    return NextResponse.json(domains, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
