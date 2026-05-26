import { NextRequest, NextResponse } from "next/server";
import { getSources } from "@/lib/services/content.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/contents
 *
 * List imported contents for the workspace, paginated.
 *
 * QUERY PARAMS:
 * - page (optional): default 1
 * - limit (optional): default 50, max 100
 * - search (optional): substring on source_url (case-insensitive)
 * - domain (optional): exact domain filter
 * - domain_id (optional): exact domain UUID filter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const search = searchParams.get("search") ?? undefined;
    const domain = searchParams.get("domain") ?? undefined;
    const domainId = searchParams.get("domain_id") ?? undefined;

    const result = await getSources({ workspaceId, page, limit, search, domain, domainId });

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
