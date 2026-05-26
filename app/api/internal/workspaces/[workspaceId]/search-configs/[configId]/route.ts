import { NextRequest, NextResponse } from "next/server";
import { updateSearchConfigSchema } from "@/lib/validations/search-config.schema";
import {
  getSearchConfigById,
  updateSearchConfig,
  deleteSearchConfig,
} from "@/lib/services/search-config.service";
import {
  requireWorkspaceMembership,
  resolveResourceId,
} from "@/lib/services/workspace-resolver";

async function resolveConfigId(param: string): Promise<string | null> {
  return resolveResourceId("search_configs", param);
}

/**
 * GET /api/internal/workspaces/:workspaceId/search-configs/:configId
 * Get a single SearchConfig by ID (or public_id).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; configId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: wsParam, configId: cfgParam } = await params;
    const auth = await requireWorkspaceMembership(wsParam);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const configId = await resolveConfigId(cfgParam);
    if (!configId) {
      return NextResponse.json({ error: "search_config not found" }, { status: 404 });
    }

    const config = await getSearchConfigById(configId, workspaceId);
    if (!config) {
      return NextResponse.json({ error: "search_config not found" }, { status: 404 });
    }

    return NextResponse.json(config, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/internal/workspaces/:workspaceId/search-configs/:configId
 * Update a SearchConfig (partial update).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; configId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: wsParam, configId: cfgParam } = await params;
    const auth = await requireWorkspaceMembership(wsParam);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const configId = await resolveConfigId(cfgParam);
    if (!configId) {
      return NextResponse.json({ error: "search_config not found" }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateSearchConfigSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const updated = await updateSearchConfig(configId, workspaceId, validation.data);
    if (!updated) {
      return NextResponse.json({ error: "search_config not found" }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/internal/workspaces/:workspaceId/search-configs/:configId
 * Delete a SearchConfig (cascade removes junction rows).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; configId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: wsParam, configId: cfgParam } = await params;
    const auth = await requireWorkspaceMembership(wsParam);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const configId = await resolveConfigId(cfgParam);
    if (!configId) {
      return NextResponse.json({ error: "search_config not found" }, { status: 404 });
    }

    const deleted = await deleteSearchConfig(configId, workspaceId);
    if (!deleted) {
      return NextResponse.json({ error: "search_config not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
