import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { createBotSubscriptionSchema } from "@/lib/validations/wallet.schema";
import {
  createBotSubscription,
  listBotSubscriptions,
} from "@/lib/services/wallet.service";

/**
 * GET /api/workspaces/:id/bot-subscriptions
 * List non-archived bot subscriptions for the workspace.
 * Optional ?bot_id= filter.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;
    const botId = request.nextUrl.searchParams.get("bot_id") ?? undefined;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscriptions = await listBotSubscriptions(workspaceId, user.id, { botId });
    return NextResponse.json(subscriptions, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * POST /api/workspaces/:id/bot-subscriptions
 * Create a new bot subscription for a subscribed bot (owner/admin only).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = createBotSubscriptionSchema.safeParse(body);

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

    const subscription = await createBotSubscription(workspaceId, user.id, {
      botId: parsed.data.bot_id,
      externalUserId: parsed.data.external_user_id ?? null,
      label: parsed.data.label ?? null,
    });

    return NextResponse.json(subscription, { status: 201 });
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
    if (err.message === "BOT_NOT_IN_WORKSPACE") {
      return NextResponse.json(
        { error: "bot_not_in_workspace" },
        { status: 422 }
      );
    }
    if (err.message === "BOT_SUBSCRIPTION_DUPLICATE") {
      return NextResponse.json(
        { error: "external_user_id already exists for this bot" },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
