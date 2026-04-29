import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import {
  subscribePresetSchema,
  createCustomBotSchema,
} from "@/lib/validations/user-agent.schema";
import {
  subscribeToPreset,
  createCustomBot,
  getWorkspaceBots,
} from "@/lib/services/agent.service";

/**
 * GET /api/bots
 *
 * List all bots for a workspace (via workspace_bots junction).
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const bots = await getWorkspaceBots(workspaceId);
    return NextResponse.json(bots, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/bots
 *
 * Dispatcher on the `action` field:
 *   - subscribe_preset: subscribe the workspace to an existing platform preset
 *   - create_custom:    create a new custom bot owned by this workspace
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

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const action = body?.action as string | undefined;

    if (action === "subscribe_preset") {
      const validation = subscribePresetSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "Validation failed", issues: validation.error.issues },
          { status: 400 }
        );
      }

      const bot = await subscribeToPreset(workspaceId, validation.data.name);
      return NextResponse.json(bot, { status: 201 });
    }

    if (action === "create_custom") {
      const validation = createCustomBotSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "Validation failed", issues: validation.error.issues },
          { status: 400 }
        );
      }

      const { action: _action, ...botData } = validation.data;
      void _action;
      const bot = await createCustomBot(workspaceId, botData);
      return NextResponse.json(bot, { status: 201 });
    }

    return NextResponse.json(
      { error: "INVALID_ACTION", message: "action must be 'subscribe_preset' or 'create_custom'" },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "PRESET_NOT_FOUND":
          return NextResponse.json({ error: "Preset not found" }, { status: 404 });
        case "NOT_A_PRESET":
          return NextResponse.json(
            { error: "NOT_A_PRESET", message: "That bot name belongs to a custom bot in another workspace" },
            { status: 403 }
          );
        case "ALREADY_IN_WORKSPACE":
          return NextResponse.json(
            { error: "This bot is already in the workspace" },
            { status: 409 }
          );
        case "NAME_CONFLICT_WITH_PRESET":
          return NextResponse.json(
            { error: "NAME_CONFLICT", message: "That name is already used by a platform preset" },
            { status: 409 }
          );
        case "CUSTOM_BOT_ALREADY_EXISTS":
          return NextResponse.json(
            { error: "CUSTOM_BOT_EXISTS", message: "A custom bot with that name already exists" },
            { status: 409 }
          );
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
