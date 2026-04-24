import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { createWalletSchema } from "@/lib/validations/wallet.schema";
import { createWallet, listWallets } from "@/lib/services/wallet.service";

/**
 * GET /api/workspaces/:id/wallets
 * List non-archived wallets for the workspace. Optional ?agent_id= filter.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;
    const agentId = request.nextUrl.searchParams.get("agent_id") ?? undefined;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wallets = await listWallets(workspaceId, user.id, { agentId });
    return NextResponse.json(wallets, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * POST /api/workspaces/:id/wallets
 * Create a new wallet for a subscribed bot (owner/admin only).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = createWalletSchema.safeParse(body);

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

    const wallet = await createWallet(workspaceId, user.id, {
      agentId: parsed.data.agent_id,
      externalUserId: parsed.data.external_user_id ?? null,
      label: parsed.data.label ?? null,
    });

    return NextResponse.json(wallet, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}

function mapError(err: unknown): NextResponse {
  if (err instanceof Error) {
    if (err.message === "NOT_MEMBER") {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err.message === "AGENT_NOT_IN_WORKSPACE") {
      return NextResponse.json(
        { error: "agent_not_in_workspace" },
        { status: 422 }
      );
    }
    if (err.message === "WALLET_DUPLICATE") {
      return NextResponse.json(
        { error: "external_user_id already exists for this bot" },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
