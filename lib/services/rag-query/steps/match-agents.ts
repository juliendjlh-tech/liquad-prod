// ---------------------------------------------------------------------------
// Step 4: Agent resolution + ua_pattern reconciliation
//
// Resolves the consumer's agent by ID, validates declared_ips,
// then matches catalogs via ua_pattern (same reconciliation as
// consumer.service.ts — preset and operator agents unify).
// ---------------------------------------------------------------------------

import type { PipelineStep } from "../types";
import { getAgentById, getCatalogAgents } from "@/lib/db/queries/agents";

/**
 * Resolve the consumer's agent and match catalogs via ua_pattern.
 *
 * 1. Fetch agent by input.agent_id — extract ua_pattern
 * 2. Require declared_ips (agents without IPs can't participate in paid flows)
 * 3. Batch-fetch all catalog–agent links for requested catalogs
 * 4. Keep only catalogs linked to an agent with matching ua_pattern
 *
 * Sets ctx.agentId, ctx.uaPattern, ctx.validCatalogIds on success.
 */
export const matchAgents: PipelineStep = async (ctx) => {
  const { catalogs, input } = ctx;

  // 1. Resolve agent
  const agent = await getAgentById(input.agent_id);
  if (!agent) {
    return {
      error: "agent_not_found",
      status: 404,
      details: { agent_id: input.agent_id },
    };
  }

  // 2. Require declared IPs for paid transactions
  if (!agent.declared_ips || agent.declared_ips.length === 0) {
    return {
      error: "agent_missing_ips",
      status: 422,
      details: {
        agent_id: input.agent_id,
        message: "Agent must have declared IP ranges to participate in paid transactions",
      },
    };
  }

  const uaPattern = agent.ua_pattern;

  // 3. Batch-fetch all catalog–agent links
  const catalogIds = catalogs!.map((c) => c.id);
  const allLinks = await getCatalogAgents(catalogIds);

  // 4. Keep catalogs linked to an agent with matching ua_pattern
  const catalogsWithMatch = new Set(
    allLinks
      .filter((link) => link.agent.ua_pattern === uaPattern)
      .map((link) => link.catalog_id)
  );

  const validCatalogIds: string[] = [];
  for (const catalog of catalogs!) {
    if (!catalogsWithMatch.has(catalog.id)) {
      return {
        error: "agent_not_matched",
        status: 403,
        details: { catalog_id: catalog.id, ua_pattern: uaPattern },
      };
    }
    validCatalogIds.push(catalog.id);
  }

  ctx.agentId = agent.id;
  ctx.uaPattern = uaPattern;
  ctx.validCatalogIds = validCatalogIds;
};
