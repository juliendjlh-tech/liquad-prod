import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { updateBotSubscriptionScopeSchema } from "@/lib/validations/wallet.schema";
import { setBotSubscriptionScope } from "@/lib/services/wallet.service";

/**
 * PATCH /api/workspaces/:id/bot-subscriptions/:botSubscriptionId/scope
 *
 * Toggle Option F's per-subscription scope.
 *   - true  → workspace-only (default, safe to share with partners)
 *   - false → opt-in network access; debits the wallet on cross-workspace
 *             paid catalogs.
 *
 * The change is observed on the next /api/consumer/v1/* call; no API key
 * rotation required.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; botSubscriptionId: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId, botSubscriptionId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = updateBotSubscriptionScopeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
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

    const result = await setBotSubscriptionScope(
      workspaceId,
      user.id,
      botSubscriptionId,
      parsed.data.scope_to_workspace
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Bot subscription not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
