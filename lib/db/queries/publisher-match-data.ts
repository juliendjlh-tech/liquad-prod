// ---------------------------------------------------------------------------
// Publisher match data query module
//
// Assembles the data needed for URL → catalog matching:
//   - HMAC secret (for token signing/verification)
//   - Agents with their catalog_ids (sorted by price ASC)
//   - Catalogs with resolved filter_rules (domain_id → hostname)
//
// Shared by:
//   - sdk-transaction.service.ts  (paid matching + debit)
//   - sdk-gateway.service.ts      (free catalog matching in SDK)
// ---------------------------------------------------------------------------

import { getWorkspaceSecret } from "@/lib/db/queries/workspaces";
import { getWorkspaceAgents, getCatalogAgents } from "@/lib/db/queries/agents";
import { getCatalogs } from "@/lib/db/queries/catalogs";
import { getDomainMap } from "@/lib/db/queries/domains";
import type { MatchableAgent, MatchableCatalog } from "@liquad/sdk/matcher";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublisherMatchData {
  hmacSecret: string;
  agents: MatchableAgent[];
  catalogs: MatchableCatalog[];
}

export interface PublisherMatchDataOptions {
  maxPriceEur?: number;
  /** If set, only return catalogs with this exact price (e.g., 0 for free) */
  exactPriceEur?: number;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Fetch and assemble all data needed for URL → catalog matching
 * for a given publisher workspace.
 *
 * Runs independent queries in parallel, then resolves domain_id → hostname
 * in catalog filter_rules.
 */
export async function getPublisherMatchData(
  workspaceId: string,
  options?: PublisherMatchDataOptions
): Promise<PublisherMatchData> {
  // Parallel: independent queries
  const [hmacSecret, agents, rawCatalogs, domainIdToHostname] =
    await Promise.all([
      getWorkspaceSecret(workspaceId),
      getWorkspaceAgents(workspaceId),
      getCatalogs([], {
        workspaceId,
        status: "active",
        maxPriceEur: options?.maxPriceEur,
      }),
      getDomainMap(workspaceId),
    ]);

  // Build agent → catalog_ids map (sorted by price ASC)
  const catalogIds = rawCatalogs.map((c) => c.id);
  const links = await getCatalogAgents(catalogIds);

  const catalogPriceMap = new Map(rawCatalogs.map((c) => [c.id, c.price_eur]));
  const agentToCatalogIds = new Map<string, string[]>();

  for (const link of links) {
    const ids = agentToCatalogIds.get(link.agent_id) ?? [];
    ids.push(link.catalog_id);
    agentToCatalogIds.set(link.agent_id, ids);
  }

  for (const [, ids] of agentToCatalogIds) {
    ids.sort(
      (a, b) => (catalogPriceMap.get(a) ?? 0) - (catalogPriceMap.get(b) ?? 0)
    );
  }

  // Filter catalogs by exact price if requested (e.g., free catalogs only)
  const filteredCatalogs =
    options?.exactPriceEur !== undefined
      ? rawCatalogs.filter((c) => c.price_eur === options.exactPriceEur)
      : rawCatalogs;

  // Resolve domain_id → hostname in filter_rules
  const catalogs: MatchableCatalog[] = filteredCatalogs.map((catalog) => {
    const rawRules = catalog.filter_rules as unknown as {
      domain_rules: Array<{
        domain_id: string;
        path_rules?: Array<{ operator: string; value: string }>;
        path_logic?: "AND" | "OR";
      }>;
    };

    return {
      id: catalog.id,
      name: catalog.name,
      price_eur: catalog.price_eur,
      filter_rules: {
        domain_rules: (rawRules?.domain_rules ?? [])
          .map((rule) => {
            const hostname = domainIdToHostname.get(rule.domain_id);
            if (!hostname) return null;
            return {
              domain: hostname,
              ...(rule.path_rules?.length ? { path_rules: rule.path_rules } : {}),
              ...(rule.path_logic ? { path_logic: rule.path_logic } : {}),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null),
      },
    };
  });

  // Build MatchableAgent[]
  const matchableAgents: MatchableAgent[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    ua_pattern: a.ua_pattern,
    declared_ips: (a.declared_ips as string[]) ?? [],
    catalog_ids: agentToCatalogIds.get(a.id) ?? [],
  }));

  return { hmacSecret, agents: matchableAgents, catalogs };
}
