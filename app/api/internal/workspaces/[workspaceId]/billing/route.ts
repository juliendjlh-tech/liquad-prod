import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/internal/workspaces/:workspaceId/billing
 *
 * Returns the workspace's billing state for the dashboard:
 *   - balance_eur          (current wallet balance)
 *   - recurring            (active Stripe recurring subscription, or null)
 *   - stripe_customer_id   (presence of a Stripe customer)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const supabase = await createServerClient();

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("balance_eur, stripe_customer_id")
      .eq("id", workspaceId)
      .single();

    const { data: recurring } = await supabase
      .from("billing_subscriptions")
      .select(
        "stripe_subscription_id, status, current_period_end, monthly_credit_amount_eur, stripe_price_id, cancel_at_period_end"
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    return NextResponse.json(
      {
        balance_eur: Number(workspace?.balance_eur ?? 0),
        stripe_customer_id: workspace?.stripe_customer_id ?? null,
        recurring: recurring
          ? {
              status: recurring.status,
              current_period_end: recurring.current_period_end,
              monthly_credit_amount_eur: Number(recurring.monthly_credit_amount_eur),
              stripe_price_id: recurring.stripe_price_id,
              cancel_at_period_end: recurring.cancel_at_period_end,
            }
          : null,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
