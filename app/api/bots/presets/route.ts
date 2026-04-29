import { NextResponse } from "next/server";
import { getPresetBots } from "@/lib/services/agent.service";

/**
 * GET /api/bots/presets
 *
 * Returns all platform preset bots from the DB (type = 'preset'),
 * enriched with the operator field from the in-memory AI_BOT_PRESETS list.
 * Used by the preset picker so clients can subscribe to them.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const presets = await getPresetBots();
    return NextResponse.json(presets, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
