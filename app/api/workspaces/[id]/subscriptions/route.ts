import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { createSubscriptionSchema } from "@/lib/validations/subscription.schema";
import {
  createSubscription,
  listSubscriptions,
  type SubscriptionMode,
} from "@/lib/services/subscription.service";

/**
 * GET /api/workspaces/:id/subscriptions
 * List non-archived subscriptions for the workspace.
 *
 * Optional `?mode=publisher|access` filters by scope_to_workspace.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const modeParam = request.nextUrl.searchParams.get("mode");
    const mode: SubscriptionMode | undefined =
      modeParam === "publisher" || modeParam === "access" ? modeParam : undefined;

    const subscriptions = await listSubscriptions(workspaceId, user.id, mode);
    return NextResponse.json(subscriptions, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * POST /api/workspaces/:id/subscriptions
 * Create a new subscription (owner/admin only). The body must include
 * `mode: 'publisher' | 'access'` which determines scope_to_workspace.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = createSubscriptionSchema.safeParse(body);

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

    const subscription = await createSubscription(workspaceId, user.id, {
      mode: parsed.data.mode,
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
    if (err.message === "PUBLISHER_DISABLED") {
      return NextResponse.json(
        { error: "Workspace is not a publisher" },
        { status: 403 }
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
