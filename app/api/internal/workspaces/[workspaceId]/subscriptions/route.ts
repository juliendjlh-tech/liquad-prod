import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionSchema } from "@/lib/validations/subscription.schema";
import {
  createSubscription,
  listSubscriptions,
} from "@/lib/services/subscription.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/subscriptions
 * List non-archived subscriptions for the workspace.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const publicIdPrefix =
      request.nextUrl.searchParams.get("public_id_prefix") ?? undefined;
    const limitRaw = request.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw), 1), 50) : undefined;

    const subscriptions = await listSubscriptions(workspaceId, userId, {
      publicIdPrefix,
      limit,
    });
    return NextResponse.json(subscriptions, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * POST /api/internal/workspaces/:workspaceId/subscriptions
 * Create a new wallet (owner/admin only). The creating workspace becomes the
 * sub manager that will receive the 7% revenue share for this subscription.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const body = await request.json().catch(() => null);
    const parsed = createSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const subscription = await createSubscription(workspaceId, userId, {
      externalUserId: parsed.data.external_user_id ?? null,
      label: parsed.data.label ?? null,
      monthlyCapEur: parsed.data.monthly_cap_eur ?? null,
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
    if (err.message === "SUBSCRIPTION_DUPLICATE") {
      return NextResponse.json(
        { error: "external_user_id already exists in this workspace" },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
