import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { archiveWallet } from "@/lib/services/wallet.service";

/**
 * DELETE /api/workspaces/:id/wallets/:walletId
 * Archive a wallet (owner/admin). Fails if balance > 0.
 * All active keys pointing at the wallet are revoked as part of the archive.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; walletId: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId, walletId } = await params;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await archiveWallet(workspaceId, user.id, walletId);
    return new NextResponse(null, { status: 204 });
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
      if (err.message === "WALLET_HAS_BALANCE") {
        return NextResponse.json(
          { error: "Wallet still has a balance — refund before archiving" },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
