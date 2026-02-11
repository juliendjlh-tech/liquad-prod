import { NextResponse } from "next/server";
import { AI_BOT_PRESETS } from "@/lib/services/user-agent.service";

/**
 * GET /api/user-agents/presets
 *
 * Returns the list of available AI bot presets.
 * These are hardcoded known bots that users can add to their workspace.
 *
 * This endpoint does NOT require workspace membership — presets are
 * global reference data. Authentication is still enforced by middleware.
 *
 * RESPONSE:
 * - 200: Array of `{ name, ua_pattern, operator }`
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(AI_BOT_PRESETS, { status: 200 });
}
