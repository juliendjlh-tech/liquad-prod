// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterRule {
  operator: string;
  value: string;
}

interface DomainRule {
  domain: string;
  path_rules?: FilterRule[];
  path_logic?: "AND" | "OR";
}

interface CatalogFilterRules {
  domain_rules: DomainRule[];
}

/** Minimal agent shape needed for matching and gateway decisions */
export interface MatchableAgent {
  id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  catalog_ids: string[];
}

/** Minimal catalog shape needed for matching */
export interface MatchableCatalog {
  id: string;
  name: string;
  filter_rules: CatalogFilterRules;
  price_eur: number;
}

/** Input for matchRequest */
/** Input for matchRequest */
export type MatchRequestInput = {
  normalizedUrl: string;
  agents: MatchableAgent[];
  catalogs: MatchableCatalog[];
  maxPrice?: number;
} & (
  | { userAgent: string; agentIds?: never }
  | { agentIds: string[]; userAgent?: never }
);

/** Result of matchRequest — pure, no SDK event coupling */
export type MatchResult =
  | { type: "no_match" }
  | { type: "no_catalog"; agent_id: string; agent_name: string }
  | { type: "matched"; catalog_id: string; agent_id: string; agent_name: string; price_eur: number };

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function evaluatePathRule(pathname: string, rule: FilterRule): boolean {
  switch (rule.operator) {
    case "contains":
      return pathname.includes(rule.value);
    case "not_contains":
      return !pathname.includes(rule.value);
    case "starts_with":
      return pathname.startsWith(rule.value);
    case "not_starts_with":
      return !pathname.startsWith(rule.value);
    case "equals":
      return pathname === rule.value;
    case "ends_with":
      return pathname.endsWith(rule.value);
    default:
      return false;
  }
}

function matchFilterRules(
  requestDomain: string,
  requestPath: string,
  filterRules: CatalogFilterRules
): boolean {
  const matchingRules = filterRules.domain_rules.filter(
    (r) => r.domain === requestDomain
  );
  if (matchingRules.length === 0) return false;

  for (const rule of matchingRules) {
    if (!rule.path_rules || rule.path_rules.length === 0) return true;

    const logic = rule.path_logic ?? "AND";
    const matches =
      logic === "AND"
        ? rule.path_rules.every((pr) => evaluatePathRule(requestPath, pr))
        : rule.path_rules.some((pr) => evaluatePathRule(requestPath, pr));

    if (matches) return true;
  }

  return false;
}

export function matchUserAgent(
  userAgentString: string,
  agents: MatchableAgent[]
): MatchableAgent | null {
  if (!userAgentString) return null;

  const uaLower = userAgentString.toLowerCase();

  for (const agent of agents) {
    if (uaLower.includes(agent.ua_pattern.toLowerCase())) {
      return agent;
    }
  }

  return null;
}

/**
 * Find the best matching catalog for an agent on a given domain/path.
 * Filters by agent's catalog_ids, filter rules, and maxPrice.
 * Returns the catalog with the lowest price_eur, or null if none match.
 */
function findBestCatalog(
  catalogs: MatchableCatalog[],
  agentCatalogIds: string[],
  domain: string,
  requestPath: string,
  maxPrice?: number
): MatchableCatalog | null {
  const allowedIds = new Set(agentCatalogIds);

  const matching = catalogs
    .filter(
      (catalog) =>
        allowedIds.has(catalog.id) &&
        (maxPrice === undefined || catalog.price_eur <= maxPrice) &&
        matchFilterRules(domain, requestPath, catalog.filter_rules)
    )
    .sort((a, b) => a.price_eur - b.price_eur);

  return matching[0] ?? null;
}

// ---------------------------------------------------------------------------
// matchRequest — single entry point for matching
// ---------------------------------------------------------------------------

/**
 * Match a normalized URL + user-agent against agents and catalogs.
 * Pure function — no I/O, no side effects.
 *
 * Steps:
 *   1. Parse domain + path from normalizedUrl
 *   2. Match user-agent against agents
 *   3. Find best catalog (lowest price, within maxPrice ceiling)
 *
 * @param input.normalizedUrl - Already normalized URL (via normalizeUrl())
 * @param input.userAgent - Raw User-Agent string (mode UA matching)
 * @param input.agentIds - Agent IDs to match directly (mode direct, skips UA matching)
 * @param input.agents - All agents for the workspace
 * @param input.catalogs - All catalogs for the workspace
 * @param input.maxPrice - Only match catalogs with price_eur <= maxPrice (undefined = no filter)
 */
export function matchRequest(input: MatchRequestInput): MatchResult {
  const { normalizedUrl, agents, catalogs, maxPrice } = input;

  // 1. Extract domain and path from normalized URL
  let domain: string;
  let requestPath: string;
  try {
    const urlObj = new URL(normalizedUrl);
    domain = urlObj.hostname;
    requestPath = urlObj.pathname;
  } catch {
    return { type: "no_match" };
  }

  // 2. Resolve agent(s) — either by UA matching or by direct IDs
  let targetAgents: MatchableAgent[];

  if (input.agentIds) {
    const idSet = new Set(input.agentIds);
    targetAgents = agents.filter((a) => idSet.has(a.id));
  } else {
    const matched = matchUserAgent(input.userAgent, agents);
    targetAgents = matched ? [matched] : [];
  }

  if (targetAgents.length === 0) {
    return { type: "no_match" };
  }

  // 3. Find best matching catalog across all target agents (lowest price)
  let bestResult: { agent: MatchableAgent; catalog: MatchableCatalog } | null = null;

  for (const agent of targetAgents) {
    const catalog = findBestCatalog(
      catalogs,
      agent.catalog_ids,
      domain,
      requestPath,
      maxPrice
    );

    if (catalog && (!bestResult || catalog.price_eur < bestResult.catalog.price_eur)) {
      bestResult = { agent, catalog };
    }
  }

  if (!bestResult) {
    return {
      type: "no_catalog",
      agent_id: targetAgents[0].id,
      agent_name: targetAgents[0].name,
    };
  }

  return {
    type: "matched",
    catalog_id: bestResult.catalog.id,
    agent_id: bestResult.agent.id,
    agent_name: bestResult.agent.name,
    price_eur: bestResult.catalog.price_eur,
  };
}
