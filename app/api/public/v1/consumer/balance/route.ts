import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/public/v1/consumer/balance
 *
 * Returns the subscription balance and spending summary for the subscription
 * bound to the calling API key. Subscriptions are workspace-scoped and
 * bot-agnostic since migration 032.
 *
 * RESPONSE (200):
 * {
 *   workspace_id, subscription_id, balance_eur, total_spent_eur, transaction_count
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

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("balance_eur")
      .eq("id", authResult.subscriptionId)
      .single();

    if (!subscription) {
      return NextResponse.json(
        { error: "subscription_not_found" },
        { status: 404 }
      );
    }

    const { data: debits } = await supabase
      .from("credit_transactions")
      .select("amount_eur")
      .eq("subscription_id", authResult.subscriptionId)
      .eq("type", "debit");

    const transactions = debits ?? [];
    const totalSpent = transactions.reduce(
      (sum, t) => sum + Math.abs(Number(t.amount_eur)),
      0
    );

    return NextResponse.json({
      workspace_id: authResult.workspaceId,
      subscription_id: authResult.subscriptionId,
      balance_eur: Number(subscription.balance_eur),
      total_spent_eur: Math.round(totalSpent * 100) / 100,
      transaction_count: transactions.length,
    });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
