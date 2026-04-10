import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { updateCatalogSchema } from "@/lib/validations/catalog.schema";
import {
  getCatalogById,
  updateCatalog,
  deleteCatalog,
} from "@/lib/services/catalog.service";


/**
 * GET /api/catalogs/:id
 *
 * Get catalog detail with linked agents.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 200: Catalog detail with agents
 * - 400: Missing header
 * - 401: Unauthorized
 * - 404: Catalog not found or wrong workspace
 * - 500: Internal server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: catalogId } = await params;
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

    const catalog = await getCatalogById(catalogId, workspaceId);

    if (!catalog) {
      return NextResponse.json(
        { error: "catalog not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(catalog, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/catalogs/:id
 *
 * Update a catalog. Supports partial updates for name, description,
 * filter_rules, agent_ids, price_eur, and status.
 *
 * When status is set to "active", checks for verified domains and
 * includes a warning if none exist (activation still proceeds).
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 200: Updated catalog (with optional warning field)
 * - 400: Validation error or invalid agent_ids
 * - 401: Unauthorized
 * - 404: Catalog not found or wrong workspace
 * - 500: Internal server error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: catalogId } = await params;
    const workspaceId = request.headers.get("x-workspace-id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = updateCatalogSchema.safeParse(body);

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

    const updated = await updateCatalog(
      catalogId,
      workspaceId,
      validation.data
    );

    if (!updated) {
      return NextResponse.json(
        { error: "catalog not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_AGENT_IDS") {
      return NextResponse.json(
        { error: "agent_ids contains invalid or unauthorized agent IDs" },
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

/**
 * DELETE /api/catalogs/:id
 *
 * Delete a catalog. Cascade removes catalog_agents entries.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 204: No content (deleted)
 * - 400: Missing header
 * - 401: Unauthorized
 * - 404: Catalog not found or wrong workspace
 * - 500: Internal server error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: catalogId } = await params;
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

    const deleted = await deleteCatalog(catalogId, workspaceId);

    if (!deleted) {
      return NextResponse.json(
        { error: "catalog not found" },
        { status: 404 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
