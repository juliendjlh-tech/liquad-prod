import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/bots/lookup?public_id=bot_xxxxxxxx
 *
 * Look up any bot by its public_id, regardless of which workspace owns it.
 * Used by the "Add by public id" flow (CTA 2): the consumer types a bot
 * public_id and we resolve it to a full bot row that can then back a new
 * access settings.
 *
 * Returns 404 if no bot with that public_id exists. Workspace membership
 * is still required so the endpoint isn't an unauthenticated probe.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const publicId = request.nextUrl.searchParams.get("public_id");
    if (!publicId) {
      return NextResponse.json(
        { error: "missing_public_id" },
        { status: 400 },
      );
    }

    const supabase = await createServerClient();
    const { data: bot, error } = await supabase
      .from("bots")
      .select("id, public_id, name, ua_pattern, declared_ips, type, description, created_at")
      .eq("public_id", publicId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "internal_error", message: error.message },
        { status: 500 },
      );
    }
    if (!bot) {
      return NextResponse.json({ error: "bot_not_found" }, { status: 404 });
    }

    return NextResponse.json(bot, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
