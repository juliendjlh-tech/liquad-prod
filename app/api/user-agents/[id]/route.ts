import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { updateUserAgentSchema } from "@/lib/validations/user-agent.schema";
import {
  getUserAgentById,
  updateUserAgent,
  deleteUserAgent,
} from "@/lib/services/user-agent.service";

/**
 * GET /api/user-agents/:id
 *
 * Get a single user-agent by ID, scoped to workspace.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 200: User-agent record
 * - 400: Missing header
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
 * - 404: Not found or wrong workspace
 * - 500: Internal server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: userAgentId } = await params;
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

    const agent = await getUserAgentById(userAgentId, workspaceId);

    if (!agent) {
      return NextResponse.json(
        { error: "User-agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(agent, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user-agents/:id
 *
 * Update a user-agent (name, ua_pattern, is_active).
 * Supports partial updates.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * REQUEST BODY (JSON): any combination of { name, ua_pattern, is_active }
 *
 * RESPONSES:
 * - 200: Updated user-agent record
 * - 400: Validation error or missing header
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
 * - 404: Not found or wrong workspace
 * - 500: Internal server error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: userAgentId } = await params;
    const workspaceId = request.headers.get("x-workspace-id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    // Validate request body
    const body = await request.json();
    const validation = updateUserAgentSchema.safeParse(body);

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

    const updated = await updateUserAgent(
      userAgentId,
      workspaceId,
      validation.data
    );

    if (!updated) {
      return NextResponse.json(
        { error: "User-agent not found" },
        { status: 404 }
      );
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
 * DELETE /api/user-agents/:id
 *
 * Delete a user-agent. Catalog links are removed via CASCADE.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 200: `{ deleted: true, id, warning? }`
 * - 400: Missing header
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
 * - 404: Not found or wrong workspace
 * - 500: Internal server error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: userAgentId } = await params;
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

    const result = await deleteUserAgent(userAgentId, workspaceId);

    if (!result.deleted) {
      return NextResponse.json(
        { error: "User-agent not found" },
        { status: 404 }
      );
    }

    const response: { deleted: boolean; id: string; warning?: string } = {
      deleted: true,
      id: userAgentId,
    };

    if (result.catalogCount > 0) {
      response.warning = `This user-agent was linked to ${result.catalogCount} catalog(s). Those links have been removed.`;
    }

    return NextResponse.json(response, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
