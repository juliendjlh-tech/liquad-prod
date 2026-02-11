import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { createUserAgentSchema } from "@/lib/validations/user-agent.schema";
import {
  createUserAgent,
  getUserAgents,
} from "@/lib/services/user-agent.service";

/**
 * GET /api/user-agents
 *
 * List all user-agents for a workspace.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 200: Array of user-agent records
 * - 400: Missing x-workspace-id header
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
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

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const agents = await getUserAgents(workspaceId);

    return NextResponse.json(agents, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user-agents
 *
 * Create a new user-agent for a workspace.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * REQUEST BODY (JSON):
 * ```json
 * { "name": "GPTBot", "ua_pattern": "GPTBot", "is_preset": true }
 * ```
 *
 * RESPONSES:
 * - 201: Created user-agent record
 * - 400: Validation error or missing header
 * - 401: Unauthorized
 * - 403: User not a member of the workspace
 * - 409: Duplicate name in workspace
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

    // Validate request body
    const body = await request.json();
    const validation = createUserAgentSchema.safeParse(body);

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

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const agent = await createUserAgent(workspaceId, validation.data);

    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "DUPLICATE_NAME") {
      return NextResponse.json(
        { error: "A user-agent with this name already exists in the workspace" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
