import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/services/auth.service";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * GET /api/consumer/balance
 *
 * Returns workspace balance and spending summary.
 * Authentication: API key via Authorization: Bearer <key>
 *
 * RESPONSE (200):
 * {
 *   workspace_id: string,
 *   balance_eur: number,
 *   total_spent_eur: number,
 *   transaction_count: number
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await authenticateApiKey(
      request.headers.get("authorization")
    );
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const supabase = await createServerClient();

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, balance_eur")
      .eq("id", authResult.workspaceId)
      .single();

    if (!workspace) {
      return NextResponse.json(
        { error: "workspace_not_found" },
        { status: 404 }
      );
    }

    const { data: debits } = await supabase
      .from("credit_transactions")
      .select("amount_eur")
      .eq("consumer_workspace_id", authResult.workspaceId)
      .eq("type", "debit");

    const transactions = debits ?? [];
    const totalSpent = transactions.reduce(
      (sum, t) => sum + Math.abs(Number(t.amount_eur)),
      0
    );

    return NextResponse.json({
      workspace_id: workspace.id,
      balance_eur: Number(workspace.balance_eur),
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
