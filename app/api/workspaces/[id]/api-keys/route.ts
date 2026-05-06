import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { createApiKeySchema } from "@/lib/validations/api-key.schema";
import { createApiKey, listApiKeys } from "@/lib/services/api-key.service";

/**
 * GET /api/workspaces/:id/api-keys
 * List non-revoked consumer API keys for a workspace (any member).
 * Optional ?subscription_id= filter.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;
    const subscriptionId =
      request.nextUrl.searchParams.get("subscription_id") ?? undefined;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await listApiKeys(workspaceId, user.id, { subscriptionId });
    return NextResponse.json(keys, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * POST /api/workspaces/:id/api-keys
 * Create a new consumer API key (owner/admin only).
 * Returns the plaintext key ONCE.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = createApiKeySchema.safeParse(body);

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

    const result = await createApiKey(workspaceId, user.id, {
      label: parsed.data.label,
      subscriptionId: parsed.data.subscription_id,
      mode: parsed.data.mode,
      subscriptionLabel: parsed.data.subscription_label,
      subscriptionExternalUserId: parsed.data.subscription_external_user_id,
      defaultBotId: parsed.data.default_bot_id,
    });

    return NextResponse.json(result, { status: 201 });
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
    if (err.message === "SUBSCRIPTION_NOT_FOUND") {
      return NextResponse.json(
        { error: "subscription_not_found" },
        { status: 404 }
      );
    }
    if (err.message === "MODE_REQUIRED") {
      return NextResponse.json(
        { error: "mode is required when subscription_id is omitted" },
        { status: 400 }
      );
    }
    if (err.message === "PUBLISHER_DISABLED") {
      return NextResponse.json(
        { error: "Workspace is not a publisher" },
        { status: 403 }
      );
    }
    if (err.message === "BOT_NOT_IN_WORKSPACE") {
      return NextResponse.json(
        { error: "bot_not_in_workspace" },
        { status: 422 }
      );
    }
    if (err.message === "SUBSCRIPTION_DUPLICATE") {
      return NextResponse.json(
        { error: "external_user_id already exists in this workspace" },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
