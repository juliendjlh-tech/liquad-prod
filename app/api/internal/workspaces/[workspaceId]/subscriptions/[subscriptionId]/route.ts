import { NextRequest, NextResponse } from "next/server";
import {
  archiveSubscription,
  updateSubscription,
} from "@/lib/services/subscription.service";
import { updateSubscriptionSchema } from "@/lib/validations/subscription.schema";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * DELETE /api/internal/workspaces/:workspaceId/subscriptions/:subscriptionId
 * Archive a subscription (owner/admin). Fails if balance > 0.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; subscriptionId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, subscriptionId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    await archiveSubscription(workspaceId, userId, subscriptionId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * PATCH /api/internal/workspaces/:workspaceId/subscriptions/:subscriptionId
 * Update label / external_user_id. Owner/admin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; subscriptionId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, subscriptionId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const body = await request.json().catch(() => null);
    const parsed = updateSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const updated = await updateSubscription(workspaceId, userId, subscriptionId, {
      label: parsed.data.label,
      externalUserId: parsed.data.external_user_id,
      monthlyCapEur: parsed.data.monthly_cap_eur,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

function mapError(err: unknown): NextResponse {
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
    if (err.message === "INVALID_MONTHLY_CAP") {
      return NextResponse.json({ error: "Invalid monthly_cap_eur" }, { status: 400 });
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
