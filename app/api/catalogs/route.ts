import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { createCatalogSchema } from "@/lib/validations/catalog.schema";
import { createCatalog, getCatalogs } from "@/lib/services/catalog.service";

/**
 * GET /api/catalogs
 *
 * List all catalogs for a workspace, ordered by created_at ASC.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 200: Array of catalog list items with bot_count
 * - 400: Missing header
 * - 401: Unauthorized
 * - 403: User not a member
 * - 500: Internal server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
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

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const catalogs = await getCatalogs(workspaceId);
    return NextResponse.json(catalogs, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/catalogs
 *
 * Create a new catalog with URL patterns, authorized agents, and pricing.
 * New catalogs always start with status "inactive".
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * REQUEST BODY (JSON):
 * ```json
 * {
 *   "name": "Premium Articles",
 *   "description": "All premium content",
 *   "filter_rules": { "domain_rules": [{ "domain_id": "<uuid>" }] },
 *   "bot_ids": ["<uuid>"],
 *   "price_eur": 0.50
 * }
 * ```
 *
 * RESPONSES:
 * - 201: Created catalog with bots
 * - 400: Validation error or invalid bot_ids
 * - 401: Unauthorized
 * - 403: User not a member
 * - 500: Internal server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = createCatalogSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
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

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const catalog = await createCatalog(workspaceId, validation.data);
    return NextResponse.json(catalog, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_BOT_IDS") {
      return NextResponse.json(
        { error: "bot_ids contains invalid or unauthorized bot IDs" },
        { status: 400 }
      );
    }
    if (err instanceof Error && err.message === "INVALID_DOMAIN_IDS") {
      return NextResponse.json(
        { error: "filter_rules contains domain_ids not belonging to this workspace" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
