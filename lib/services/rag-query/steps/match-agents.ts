// ---------------------------------------------------------------------------
// Steps 4-5: User-Agent matching per catalog
//
// For each catalog, verify the consumer's UA matches at least one
// of the publisher's authorized agents.
// ---------------------------------------------------------------------------

import type { PipelineStep } from "../types";
import { getCatalogAgents } from "@/lib/db/queries/agents";

/**
 * Match the consumer's User-Agent against each catalog's authorized agents.
 *
 * Batch-fetches all catalog–agent links in a single query, then checks
 * if the UA string contains the agent's ua_pattern (case-insensitive).
 * Catalogs without a matching agent are rejected immediately.
 *
 * Sets ctx.validCatalogIds on success.
 */
export const matchAgents: PipelineStep = async (ctx) => {
  const { catalogs, userAgent } = ctx;
  const ua = userAgent ?? "";
  const uaLower = ua.toLowerCase();

  // Batch-fetch all catalog–agent links in one query
  const catalogIds = catalogs!.map((c) => c.id);
  const allLinks = await getCatalogAgents(catalogIds);

  // Group agents by catalog_id
  const agentsByCatalog = new Map<string, Array<{ id: string; ua_pattern: string }>>();
  for (const link of allLinks) {
    const existing = agentsByCatalog.get(link.catalog_id) ?? [];
    existing.push(link.agent);
    agentsByCatalog.set(link.catalog_id, existing);
  }

  const validCatalogIds: string[] = [];

  for (const catalog of catalogs!) {
    const agents = agentsByCatalog.get(catalog.id);

    if (!agents || agents.length === 0) {
      return {
        error: "agent_not_matched",
        status: 403,
        details: { catalog_id: catalog.id },
      };
    }

    const matchedAgent = agents.find((agent) =>
      uaLower.includes(agent.ua_pattern.toLowerCase())
    );

    if (!matchedAgent) {
      return {
        error: "agent_not_matched",
        status: 403,
        details: { catalog_id: catalog.id },
      };
    }

    validCatalogIds.push(catalog.id);
  }

  ctx.validCatalogIds = validCatalogIds;
};
