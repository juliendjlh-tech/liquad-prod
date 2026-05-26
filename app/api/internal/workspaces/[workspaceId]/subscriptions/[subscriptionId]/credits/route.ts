import { NextRequest, NextResponse } from "next/server";
import { creditSubscriptionSchema } from "@/lib/validations/subscription.schema";
import { creditSubscriptionAsAdmin } from "@/lib/services/subscription.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * POST /api/internal/workspaces/:workspaceId/subscriptions/:subscriptionId/credits
 * Admin-driven top-up (MVP). Stripe webhook will replace this path later.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; subscriptionId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, subscriptionId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const body = await request.json().catch(() => null);
    const parsed = creditSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await creditSubscriptionAsAdmin(
      workspaceId,
      userId,
      subscriptionId,
      parsed.data.amount_eur,
      parsed.data.description
    );

    return NextResponse.json(result, { status: 201 });
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
      if (err.message === "NO_ACTIVE_KEY") {
        return NextResponse.json(
          { error: "Create an API key on this subscription before crediting" },
          { status: 422 }
        );
      }
      if (err.message === "ACCESS_TOPUP_DISABLED") {
        return NextResponse.json(
          {
            error:
              "Access-mode subscriptions are topped up by the platform admin only.",
          },
          { status: 403 }
        );
      }
      if (err.message === "INVALID_AMOUNT") {
        return NextResponse.json({ error: "Invalid amount" }, { status: 422 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
