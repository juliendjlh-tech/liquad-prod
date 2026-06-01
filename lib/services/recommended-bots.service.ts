// ---------------------------------------------------------------------------
// Recommended bots service
//
// MVP curation: a hardcoded set of preset bot **names** that the consumer UI
// surfaces in the "Add integration" picker as the first-choice options.
//
// Why names and not public_ids: public_ids are random per environment (mig
// 036), so a list hardcoded by public_id would break across envs. Bot names
// (the strings shown in the dashboard, e.g. "GPTBot", "ClaudeBot") are
// stable and seeded by migration 018.
//
// Replacing this list is a 1-line code change — no migration. Update the
// roster as new presets graduate from "experimental" to "recommended".
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import type { BotRow } from "@/lib/services/agent.service";

/**
 * Names of the bots we want to feature in the "Add integration" picker as
 * the curated MVP recommendation. Order matters — the UI surfaces them in
 * this order.
 *
 * To extend: append a name here. Any name that does not match an existing
 * bot row is silently skipped at hydration.
 */
const RECOMMENDED_BOT_NAMES: readonly string[] = [
  "ClaudeBot",
  "Claude-User",
  "OAI-SearchBot",
  "PerplexityBot",
  "Googlebot",
  "Google-Extended",
  "MistralAI-User",
];

const BOT_SELECT_COLUMNS =
  "id, public_id, name, ua_pattern, declared_ips, type, description, created_at";

/**
 * Hydrate the curated names into full bot rows from the `bots` table.
 * Missing names are silently skipped so the list stays valid even if a
 * preset gets renamed or removed.
 *
 * Returns the bots in the order declared by RECOMMENDED_BOT_NAMES.
 */
export async function getRecommendedBots(): Promise<BotRow[]> {
  if (RECOMMENDED_BOT_NAMES.length === 0) return [];

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("bots")
    .select(BOT_SELECT_COLUMNS)
    .eq("type", "preset")
    .in("name", RECOMMENDED_BOT_NAMES as string[]);

  if (error) {
    throw new Error(`getRecommendedBots: ${error.message}`);
  }

  // Preserve the curated order rather than the DB's arbitrary one.
  const byName = new Map<string, BotRow>(
    (data ?? []).map((row) => [row.name, row as unknown as BotRow]),
  );

  return RECOMMENDED_BOT_NAMES.map((name) => byName.get(name)).filter(
    (b): b is BotRow => b !== undefined,
  );
}
