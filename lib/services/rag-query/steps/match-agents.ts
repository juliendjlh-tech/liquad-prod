// ---------------------------------------------------------------------------
// Step 4: Bot resolution + ua_pattern reconciliation
//
// Resolves the consumer's bot by ID, validates declared_ips,
// then matches catalogs via ua_pattern (same reconciliation as
// consumer.service.ts — preset and operator bots unify).
// ---------------------------------------------------------------------------

import type { PipelineStep } from "../types";
import { getBotById, getCatalogBots } from "@/lib/db/queries/agents";

/**
 * Resolve the consumer's bot and match catalogs via ua_pattern.
 *
 * 1. Fetch bot by input.bot_id — extract ua_pattern
 * 2. Require declared_ips (bots without IPs can't participate in paid flows)
 * 3. Batch-fetch all catalog–bot links for requested catalogs
 * 4. Keep only catalogs linked to a bot with matching ua_pattern
 *
 * Sets ctx.botId, ctx.uaPattern, ctx.validCatalogIds on success.
 */
export const matchBots: PipelineStep = async (ctx) => {
  const { catalogs, input } = ctx;

  // 1. Resolve bot
  const bot = await getBotById(input.bot_id);
  if (!bot) {
    return {
      error: "bot_not_found",
      status: 404,
      details: { bot_id: input.bot_id },
    };
  }

  // 2. Require declared IPs for paid transactions
  if (!bot.declared_ips || bot.declared_ips.length === 0) {
    return {
      error: "bot_missing_ips",
      status: 422,
      details: {
        bot_id: input.bot_id,
        message: "Bot must have declared IP ranges to participate in paid transactions",
      },
    };
  }

  const uaPattern = bot.ua_pattern;

  // 3. Batch-fetch all catalog–bot links
  const catalogIds = catalogs!.map((c) => c.id);
  const allLinks = await getCatalogBots(catalogIds);

  // 4. Keep catalogs linked to a bot with matching ua_pattern
  const catalogsWithMatch = new Set(
    allLinks
      .filter((link) => link.bot.ua_pattern === uaPattern)
      .map((link) => link.catalog_id)
  );

  const validCatalogIds: string[] = [];
  for (const catalog of catalogs!) {
    if (!catalogsWithMatch.has(catalog.id)) {
      return {
        error: "bot_not_matched",
        status: 403,
        details: { catalog_id: catalog.id, ua_pattern: uaPattern },
      };
    }
    validCatalogIds.push(catalog.id);
  }

  ctx.botId = bot.id;
  ctx.uaPattern = uaPattern;
  ctx.validCatalogIds = validCatalogIds;
};
