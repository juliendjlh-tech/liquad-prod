import { NextResponse } from "next/server";
import { getPresetAgents } from "@/lib/services/agent.service";

/**
 * GET /api/user-agents/presets
 *
 * Returns all platform preset bots from the DB (type = 'preset'),
 * enriched with the operator field from the in-memory AI_BOT_PRESETS list.
 * Used by the preset picker so clients can subscribe to them.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const presets = await getPresetAgents();
    return NextResponse.json(presets, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
