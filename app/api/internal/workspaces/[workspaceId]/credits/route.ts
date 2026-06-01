import { NextRequest, NextResponse } from "next/server";
import { creditWorkspaceSchema } from "@/lib/validations/subscription.schema";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * POST /api/internal/workspaces/:workspaceId/credits
 *
 * Admin-only manual top-up of the workspace wallet. Use Stripe webhooks for
 * customer-driven funding — this endpoint exists for refunds, comps, and
 * support escalations.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, role } = auth.workspace;

    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = creditWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("credit_workspace", {
      p_workspace_id: workspaceId,
      p_amount_eur: parsed.data.amount_eur,
      p_external_ref: null,
      p_description: parsed.data.description ?? "Manual adjustment",
      p_subscription_id: null,
    });

    if (error) {
      return NextResponse.json(
        { error: "credit_failed", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
