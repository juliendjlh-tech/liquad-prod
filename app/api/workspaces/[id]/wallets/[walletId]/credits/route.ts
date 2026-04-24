import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { creditWalletSchema } from "@/lib/validations/wallet.schema";
import { creditWalletAsAdmin } from "@/lib/services/wallet.service";

/**
 * POST /api/workspaces/:id/wallets/:walletId/credits
 * Admin-driven top-up for MVP. Will be replaced by a Stripe webhook that calls
 * the credit_wallet RPC directly once payment integration lands.
 *
 * Returns { new_balance, transaction_id }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; walletId: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId, walletId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = creditWalletSchema.safeParse(body);

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

    const result = await creditWalletAsAdmin(
      workspaceId,
      user.id,
      walletId,
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
        return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
      }
      if (err.message === "NO_ACTIVE_KEY") {
        return NextResponse.json(
          { error: "Create an API key on this wallet before crediting" },
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
