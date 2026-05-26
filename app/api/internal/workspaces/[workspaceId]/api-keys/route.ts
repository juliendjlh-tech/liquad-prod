import { NextRequest, NextResponse } from "next/server";
import { createApiKeySchema } from "@/lib/validations/api-key.schema";
import { createApiKey, listApiKeys } from "@/lib/services/api-key.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/api-keys
 * List non-revoked consumer API keys for a workspace (any member).
 * Optional ?subscription_id= / ?network_id= filters.
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

    const subscriptionId =
      request.nextUrl.searchParams.get("subscription_id") ?? undefined;
    const networkId =
      request.nextUrl.searchParams.get("network_id") ?? undefined;

    const keys = await listApiKeys(workspaceId, userId, { subscriptionId, networkId });
    return NextResponse.json(keys, { status: 200 });
  } catch (err) {
    return mapError(err);
  }
}

/**
 * POST /api/internal/workspaces/:workspaceId/api-keys
 * Create a new consumer API key (owner/admin only).
 * Body: { subscription_id, network_id, bot_id, label? }
 * Returns the plaintext key ONCE.
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
    const parsed = createApiKeySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await createApiKey(workspaceId, userId, {
      label: parsed.data.label,
      subscriptionId: parsed.data.subscription_id,
      networkId: parsed.data.network_id,
      botId: parsed.data.bot_id,
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
      return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
    }
    if (err.message === "NETWORK_NOT_FOUND") {
      return NextResponse.json({ error: "network_not_found" }, { status: 404 });
    }
    if (err.message === "BOT_NOT_DERIVED_FROM_NETWORK") {
      return NextResponse.json(
        {
          error: "bot_not_derived_from_network",
          message:
            "The chosen bot is not referenced by any accepted catalogue in this network.",
        },
        { status: 422 }
      );
    }
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
