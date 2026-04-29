import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { updateBotSchema } from "@/lib/validations/user-agent.schema";
import {
  getBotById,
  updateBot,
  removeBotFromWorkspace,
  setBotScopeToWorkspace,
} from "@/lib/services/agent.service";

/**
 * GET /api/bots/:id
 *
 * Get a single bot by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: botId } = await params;
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

    const bot = await getBotById(botId, workspaceId);
    if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

    return NextResponse.json(bot, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/bots/:id
 *
 * Update a bot. Two kinds of fields:
 *   - bot fields (name, ua_pattern, description, declared_ips):
 *     mutate the global `bots` row. Presets are immutable for clients.
 *   - scope_to_workspace: lives on workspace_bots(workspace_id, bot_id) and
 *     is per-workspace. Settable on presets too (it's a workspace-local
 *     policy, not a property of the bot identity).
 *
 * Only the workspace that owns the custom bot (has it in workspace_bots) can edit it.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: botId } = await params;
    const workspaceId = request.headers.get("x-workspace-id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = updateBotSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
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

    // Split the body: bot fields go to updateBot, scope_to_workspace goes to
    // workspace_bots. They can be sent in the same request.
    const { scope_to_workspace, ...botFields } = validation.data;
    const hasBotFields = Object.keys(botFields).length > 0;

    let updated = hasBotFields
      ? await updateBot(botId, botFields, workspaceId)
      : await getBotById(botId, workspaceId);

    if (!updated) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

    if (scope_to_workspace !== undefined) {
      const newScope = await setBotScopeToWorkspace(
        workspaceId,
        botId,
        scope_to_workspace
      );
      if (newScope === null) {
        return NextResponse.json(
          { error: "Bot not found in this workspace" },
          { status: 404 }
        );
      }
      updated = { ...updated, scope_to_workspace: newScope };
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "PRESET_IMMUTABLE") {
        return NextResponse.json(
          { error: "PRESET_IMMUTABLE", message: "Platform presets cannot be edited" },
          { status: 403 }
        );
      }
      if (err.message === "NOT_OWNER") {
        return NextResponse.json(
          { error: "NOT_OWNER", message: "You can only edit bots created by your workspace" },
          { status: 403 }
        );
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/bots/:id
 *
 * Unsubscribe a bot from a workspace.
 * For custom bots, also deletes the global bot record (and cascade data).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: botId } = await params;
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

    const result = await removeBotFromWorkspace(workspaceId, botId);

    if (!result.removed) {
      return NextResponse.json(
        { error: "Bot not found in this workspace" },
        { status: 404 }
      );
    }

    const response: { deleted: boolean; id: string; warning?: string } = {
      deleted: true,
      id: botId,
    };

    if (result.catalogCount > 0) {
      response.warning = `This bot was linked to ${result.catalogCount} catalog(s). Those links have been removed.`;
    }

    return NextResponse.json(response, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
