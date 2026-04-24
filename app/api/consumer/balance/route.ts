import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/consumer/balance
 *
 * Returns the wallet balance and spending summary for the wallet bound to
 * the calling API key. Since migration 025, balance lives on the wallet
 * entity; multiple keys can point at the same wallet, and one (workspace,
 * agent) pair can host multiple wallets for per-end-user budgets.
 *
 * Authentication: API key via Authorization: Bearer <key>
 *
 * RESPONSE (200):
 * {
 *   workspace_id: string,
 *   agent_id: string,
 *   wallet_id: string,
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

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance_eur")
      .eq("id", authResult.walletId)
      .single();

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet_not_found" },
        { status: 404 }
      );
    }

    const { data: debits } = await supabase
      .from("credit_transactions")
      .select("amount_eur")
      .eq("wallet_id", authResult.walletId)
      .eq("type", "debit");

    const transactions = debits ?? [];
    const totalSpent = transactions.reduce(
      (sum, t) => sum + Math.abs(Number(t.amount_eur)),
      0
    );

    return NextResponse.json({
      workspace_id: authResult.workspaceId,
      agent_id: authResult.agentId,
      wallet_id: authResult.walletId,
      balance_eur: Number(wallet.balance_eur),
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
