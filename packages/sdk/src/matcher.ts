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
export function findBestCatalog(
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

