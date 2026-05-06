import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { creditSubscriptionSchema } from "@/lib/validations/subscription.schema";
import { creditSubscriptionAsAdmin } from "@/lib/services/subscription.service";

/**
 * POST /api/workspaces/:id/subscriptions/:subscriptionId/credits
 * Admin-driven top-up (MVP). Stripe webhook will replace this path later.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subscriptionId: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId, subscriptionId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = creditSubscriptionSchema.safeParse(body);

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

    const result = await creditSubscriptionAsAdmin(
      workspaceId,
      user.id,
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
      if (err.message === "INVALID_AMOUNT") {
        return NextResponse.json({ error: "Invalid amount" }, { status: 422 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
