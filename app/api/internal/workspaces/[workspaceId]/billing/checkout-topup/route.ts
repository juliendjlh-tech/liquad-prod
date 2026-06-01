import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";
import { createTopupCheckoutSession } from "@/lib/services/billing.service";
import { createServerClient } from "@/lib/db/supabase-server";

const topupSchema = z.object({
  amount_eur: z.number().positive().max(100000),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

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
    const parsed = topupSchema.safeParse(body);
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

    const { url } = await createTopupCheckoutSession({
      workspaceId,
      amountEur: parsed.data.amount_eur,
      ownerEmail: user?.email ?? null,
      successUrl: parsed.data.success_url,
      cancelUrl: parsed.data.cancel_url,
    });

    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
