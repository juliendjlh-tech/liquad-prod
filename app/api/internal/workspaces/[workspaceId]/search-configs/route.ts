import { NextRequest, NextResponse } from "next/server";
import { createSearchConfigSchema } from "@/lib/validations/search-config.schema";
import {
  createSearchConfig,
  getSearchConfigs,
} from "@/lib/services/search-config.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/search-configs
 * List all SearchConfigs for the workspace.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const configs = await getSearchConfigs(workspaceId);
    return NextResponse.json(configs, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/workspaces/:workspaceId/search-configs
 * Create a new SearchConfig preset.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const body = await request.json();
    const validation = createSearchConfigSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const config = await createSearchConfig(workspaceId, validation.data);
    return NextResponse.json(config, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
