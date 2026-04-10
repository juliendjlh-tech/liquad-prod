import { NextResponse } from "next/server";
import { AI_BOT_PRESETS } from "@/lib/services/agent.service";

/**
 * GET /api/user-agents/presets
 *
 * Returns the list of available AI bot presets.
 * Each preset includes name, ua_pattern, operator, and description.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(AI_BOT_PRESETS, { status: 200 });
}
