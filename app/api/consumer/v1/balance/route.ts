import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/consumer/v1/balance
 *
 * Returns the bot subscription balance and spending summary for the
 * subscription bound to the calling API key. Since migration 025, balance
 * lives on the bot subscription entity; multiple keys can point at the same
 * subscription, and one (workspace, bot) pair can host multiple subscriptions
 * for per-end-user budgets.
 *
 * Authentication: API key via Authorization: Bearer <key>
 *
 * RESPONSE (200):
 * {
 *   workspace_id: string,
 *   bot_id: string,
 *   bot_subscription_id: string,
 *   balance_eur: number,
 *   total_spent_eur: number,
 *   transaction_count: number
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

    const { data: botSubscription } = await supabase
      .from("bot_subscriptions")
      .select("balance_eur")
      .eq("id", authResult.botSubscriptionId)
      .single();

    if (!botSubscription) {
      return NextResponse.json(
        { error: "bot_subscription_not_found" },
        { status: 404 }
      );
    }

    const { data: debits } = await supabase
      .from("credit_transactions")
      .select("amount_eur")
      .eq("bot_subscription_id", authResult.botSubscriptionId)
      .eq("type", "debit");

    const transactions = debits ?? [];
    const totalSpent = transactions.reduce(
      (sum, t) => sum + Math.abs(Number(t.amount_eur)),
      0
    );

    return NextResponse.json({
      workspace_id: authResult.workspaceId,
      bot_id: authResult.botId,
      bot_subscription_id: authResult.botSubscriptionId,
      balance_eur: Number(botSubscription.balance_eur),
      total_spent_eur: Math.round(totalSpent * 100) / 100,
      transaction_count: transactions.length,
    });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
