import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface GrantRow {
  grant_id: string;
  url: string;
  catalog_id: string;
  catalog_name: string | null;
  publisher_workspace_id: string;
  created_at: string;
  /** Consumer outflow (always negative for `debit` rows). */
  total_eur: number;
  /** Per-recipient breakdown derived from the 4 ledger rows of the grant. */
  split: {
    content_owner: number;
    sub_manager: number;
    platform_fee: number;
  };
}

/**
 * GET /api/internal/workspaces/:workspaceId/subscriptions/:subscriptionId/transactions
 *
 * Returns the subscription's debit history grouped by grant_id. Each entry
 * carries the consumer outflow (always negative) plus the per-recipient
 * split derived from the 4 ledger rows attached to the grant.
 *
 * Top-ups / credits are intentionally excluded — the dashboard UI surfaces
 * the wallet balance directly and the user asked to hide topup history.
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ workspaceId: string; subscriptionId: string }>;
  },
): Promise<NextResponse> {
  try {
    const { workspaceId: param, subscriptionId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;

    const supabase = await createServerClient();

    // Ownership check.
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("id", subscriptionId)
      .eq("workspace_id", auth.workspace.workspaceId)
      .maybeSingle();
    if (!sub) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const limit = Math.min(
      Math.max(
        Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT),
        1,
      ),
      MAX_LIMIT,
    );

    // Pull every ledger row for this subscription with role IN (debit, content_owner,
    // sub_manager, platform_fee). 4 rows per grant. We group in TS.
    type Row = {
      id: string;
      role: "debit" | "content_owner" | "sub_manager" | "platform_fee" | "credit";
      amount_eur: number;
      content_url: string | null;
      catalog_id: string | null;
      grant_id: string | null;
      created_at: string | null;
      recipient_workspace_id: string | null;
      catalogs?: { name: string } | null;
    };

    const { data: rows, error } = await supabase
      .from("credit_transactions")
      .select(
        "id, role, amount_eur, content_url, catalog_id, grant_id, created_at, " +
          "catalogs(name), recipient_workspace_id",
      )
      .eq("subscription_id", subscriptionId)
      .in("role", ["debit", "content_owner", "sub_manager", "platform_fee"])
      .not("grant_id", "is", null)
      .order("created_at", { ascending: false })
      // Pull more than `limit` raw rows so we end up with ~limit grants once grouped.
      .limit(limit * 4 + 8)
      .overrideTypes<Row[]>();

    if (error) {
      return NextResponse.json(
        { error: "internal_error", message: error.message },
        { status: 500 },
      );
    }

    const grouped = new Map<string, GrantRow>();
    for (const row of (rows ?? []) as Row[]) {
      if (!row.grant_id) continue;
      const existing = grouped.get(row.grant_id) ?? {
        grant_id: row.grant_id,
        url: row.content_url ?? "",
        catalog_id: row.catalog_id ?? "",
        catalog_name: row.catalogs?.name ?? null,
        publisher_workspace_id: "",
        created_at: row.created_at ?? "",
        total_eur: 0,
        split: { content_owner: 0, sub_manager: 0, platform_fee: 0 },
      };
      const amount = Number(row.amount_eur);
      switch (row.role) {
        case "debit":
          existing.total_eur = amount;
          // Prefer the debit row's metadata when populating identifiers.
          existing.url = row.content_url ?? existing.url;
          existing.catalog_id = row.catalog_id ?? existing.catalog_id;
          existing.catalog_name = row.catalogs?.name ?? existing.catalog_name;
          existing.created_at = row.created_at ?? existing.created_at;
          break;
        case "content_owner":
          existing.split.content_owner = amount;
          existing.publisher_workspace_id =
            row.recipient_workspace_id ?? existing.publisher_workspace_id;
          break;
        case "sub_manager":
          existing.split.sub_manager = amount;
          break;
        case "platform_fee":
          existing.split.platform_fee = amount;
          break;
      }
      grouped.set(row.grant_id, existing);
    }

    const items = [...grouped.values()]
      .sort((a, b) => (b.created_at < a.created_at ? -1 : 1))
      .slice(0, limit);

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
