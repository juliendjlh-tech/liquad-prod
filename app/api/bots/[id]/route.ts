import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { updateBotSchema } from "@/lib/validations/user-agent.schema";
import {
  getBotById,
  updateBot,
  removeBotFromWorkspace,
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
 * Update a custom bot's name, ua_pattern, description, or declared_ips.
 * Only the workspace that owns the custom bot can edit it; presets are
 * immutable for clients.
 *
 * Subscription scope (Option F opt-in network access) is no longer set on
 * the bot — it lives per-bot-subscription. See
 * /api/workspaces/:id/bot-subscriptions/:subId/scope.
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

    const updated = Object.keys(validation.data).length > 0
      ? await updateBot(botId, validation.data, workspaceId)
      : await getBotById(botId, workspaceId);

    if (!updated) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

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
