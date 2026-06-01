import { NextRequest, NextResponse } from "next/server";
import { updateBotSchema } from "@/lib/validations/user-agent.schema";
import {
  getBotById,
  updateBot,
  removeBotFromWorkspace,
} from "@/lib/services/agent.service";
import { createServerClient } from "@/lib/db/supabase-server";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/bots/:botId
 * Get a single bot by ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; botId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, botId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const bot = await getBotById(botId, workspaceId);
    if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 });

    return NextResponse.json(bot, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/internal/workspaces/:workspaceId/bots/:botId
 *
 * Update a custom bot. Presets are immutable. Subscription scope is no
 * longer set on the bot — it lives per-subscription.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; botId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, botId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const body = await request.json();
    const validation = updateBotSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

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
 * DELETE /api/internal/workspaces/:workspaceId/bots/:botId
 *
 * Unsubscribe a bot from a workspace. For custom bots, also deletes the
 * global bot record (and cascade data).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; botId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, botId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    // Block if any access_settings of this workspace references the bot —
    // deleting it would orphan the plans (and any api_keys bound to them
    // would lose their bot identity).
    const supabase = await createServerClient();
    const { count: planCount } = await supabase
      .from("access_settings")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("bot_id", botId);

    if ((planCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: "bot_in_use",
          plan_count: planCount,
          message: `Delete the ${planCount} plan(s) using this integration first.`,
        },
        { status: 422 },
      );
    }

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
