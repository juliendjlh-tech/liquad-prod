import { NextResponse } from "next/server";
import { AI_BOT_PRESETS } from "@/lib/services/user-agent.service";

/**
 * GET /api/user-agents/presets
 *
 * Returns the list of available AI bot presets (14 bots).
 * These are hardcoded known bots that users can add to their workspace.
 *
 * Each preset includes `dns_patterns` — hostname globs used by the SDK's
 * Identity Check module to verify bot identity via DNS.
 *
 * This endpoint does NOT require workspace membership — presets are
 * global reference data. Authentication is still enforced by middleware.
 *
 * RESPONSE:
 * - 200: Array of `{ name, ua_pattern, operator, dns_patterns }`
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(AI_BOT_PRESETS, { status: 200 });
}
