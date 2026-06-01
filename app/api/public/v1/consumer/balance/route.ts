import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/public/v1/consumer/balance
 *
 * Returns the workspace wallet balance + the calling subscription's monthly
 * cap status. The wallet is shared across all subscriptions of the workspace
 * (since migration 047); the cap is per subscription.
 *
 * Response (200):
 * {
 *   workspace_id, subscription_id,
 *   balance_eur,            // workspace wallet (legacy field name, kept)
 *   workspace_balance_eur,  // same value, explicit
 *   total_spent_eur,        // lifetime debit total for this subscription
 *   transaction_count,
 *   monthly_cap: {
 *     cap_eur,              // null = no cap
 *     spent_eur,            // calendar-month spent so far (UTC)
 *     resets_at             // first day of next month, 00:00 UTC
 *   }
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await authenticateConsumerKey(
      request.headers.get("authorization")
    );
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const supabase = await createServerClient();

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("balance_eur")
      .eq("id", authResult.workspaceId)
      .single();

    if (!workspace) {
      return NextResponse.json(
        { error: "workspace_not_found" },
        { status: 404 }
      );
    }

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("monthly_cap_eur")
      .eq("id", authResult.subscriptionId)
      .single();

    // Lifetime debits + transaction count for this subscription.
    const { data: debits } = await supabase
      .from("credit_transactions")
      .select("amount_eur")
      .eq("subscription_id", authResult.subscriptionId)
      .eq("role", "debit");

    const debitRows = debits ?? [];
    const totalSpent = debitRows.reduce(
      (sum, t) => sum + Math.abs(Number(t.amount_eur)),
      0
    );

    // Calendar-month spent (UTC), mirrors the SUM enforced by the RPC.
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)
    );

    const { data: monthDebits } = await supabase
      .from("credit_transactions")
      .select("amount_eur")
      .eq("subscription_id", authResult.subscriptionId)
      .eq("role", "debit")
      .gte("created_at", periodStart.toISOString());

    const monthSpent = (monthDebits ?? []).reduce(
      (sum, t) => sum + Math.abs(Number(t.amount_eur)),
      0
    );

    const balance = Number(workspace.balance_eur);
    const cap =
      subscription?.monthly_cap_eur === null || subscription?.monthly_cap_eur === undefined
        ? null
        : Number(subscription.monthly_cap_eur);

    return NextResponse.json({
      workspace_id: authResult.workspaceId,
      subscription_id: authResult.subscriptionId,
      balance_eur: balance,
      workspace_balance_eur: balance,
      total_spent_eur: Math.round(totalSpent * 10000) / 10000,
      transaction_count: debitRows.length,
      monthly_cap: {
        cap_eur: cap,
        spent_eur: Math.round(monthSpent * 10000) / 10000,
        resets_at: periodEnd.toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
