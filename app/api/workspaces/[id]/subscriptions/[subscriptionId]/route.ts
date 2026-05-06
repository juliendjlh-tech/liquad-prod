import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { archiveSubscription } from "@/lib/services/subscription.service";

/**
 * DELETE /api/workspaces/:id/subscriptions/:subscriptionId
 * Archive a subscription (owner/admin). Fails if balance > 0.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subscriptionId: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId, subscriptionId } = await params;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await archiveSubscription(workspaceId, user.id, subscriptionId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
      }
      if (err.message === "SUBSCRIPTION_HAS_BALANCE") {
        return NextResponse.json(
          { error: "Subscription still has a balance — refund before archiving" },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
