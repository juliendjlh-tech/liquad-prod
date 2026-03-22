import type { CachedRules } from "./rules-cache";
import type { SdkEvent, FilterRule, CatalogFilterRules } from "./types";

/**
 * Decision result from the matcher.
 */
export type MatchDecision =
  | { type: "passthrough" }
  | { type: "granted"; catalogId: string; price: number; event: SdkEvent }
  | {
      type: "denied";
      catalogId: string;
      price: number;
      responseBody: object;
      event: SdkEvent;
    }
  | { type: "blocked_no_catalog"; event: SdkEvent };

/**
 * Match a user-agent string against the declared user-agents.
 * Uses case-insensitive substring matching.
 */
export function matchUserAgent(
  userAgentString: string,
  declaredAgents: CachedRules["user_agents"]
): CachedRules["user_agents"][number] | null {
  if (!userAgentString) return null;

  const uaLower = userAgentString.toLowerCase();

  for (const agent of declaredAgents) {
    if (uaLower.includes(agent.ua_pattern.toLowerCase())) {
      return agent;
    }
  }

  return null;
}

/**
 * Evaluate a single path rule against a pathname.
 */
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
  }
}

/**
 * Match a request domain and path against catalog filter rules.
 * Uses structured matching (no regex).
 */
export function matchFilterRules(
  requestDomain: string,
  requestPath: string,
  filterRules: CatalogFilterRules
): boolean {
  // 1. Find domain rules matching the request domain
  const matchingRules = filterRules.domain_rules.filter(
    (r) => r.domain === requestDomain
  );
  if (matchingRules.length === 0) return false;

  // 2. Evaluate path_rules
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

/**
 * Match an incoming request against the cached rules and return a decision.
 *
 * Algorithm:
 * 1. Extract domain from host. If NOT in verified_domains → passthrough.
 * 2. Match user-agent against declared agents. If no match → passthrough.
 * 3. Check content existence — if NOT registered → blocked_no_catalog.
 * 4. Find ALL matching catalogs for the matched agent, pick the lowest price.
 * 5. If catalog found:
 *    - price <= defaultPrice → granted
 *    - price > defaultPrice → denied (402)
 * 6. If no catalog matches → blocked_no_catalog (403)
 *
 * @param contentPathSet - Pre-built Set of known content paths for O(1) lookup.
 */
export function matchRequest(
  rules: CachedRules,
  request: { url: string; host: string; userAgent: string },
  defaultPrice: number,
  contentPathSet: Set<string>
): MatchDecision {
  const { url, host, userAgent } = request;

  // 1. Check domain verification
  const domain = host.replace(/:\d+$/, ""); // Remove port if present
  if (!rules.verified_domains.includes(domain)) {
    return { type: "passthrough" };
  }

  // 2. Match user-agent
  const matchedAgent = matchUserAgent(userAgent, rules.user_agents);
  if (!matchedAgent) {
    return { type: "passthrough" };
  }

  // 3. Extract path from URL
  let requestPath: string;
  try {
    requestPath = new URL(url).pathname;
  } catch {
    // If URL parsing fails, try using the raw url as path
    requestPath = url.startsWith("/") ? url : `/${url}`;
  }

  const timestamp = new Date().toISOString();
  const requestUrl =
    url.startsWith("http") ? url : `https://${domain}${requestPath}`;

  // 3.5. Content existence check — only registered content is accessible.
  const contentKey = `${domain}${requestPath}`;
  if (!contentPathSet.has(contentKey)) {
    return {
      type: "blocked_no_catalog",
      event: {
        domain,
        request_url: requestUrl,
        user_agent_name: matchedAgent.name,
        user_agent_raw: userAgent,
        matched_catalog_id: null,
        decision: "blocked_no_catalog",
        price_applied: null,
        consumer_workspace_id: null,
        timestamp,
      },
    };
  }

  // 4. Find ALL matching catalogs for this agent (not just first match)
  const matchingCatalogs: Array<typeof rules.catalogs[number]> = [];

  for (const catalog of rules.catalogs) {
    if (!catalog.agent_ids.includes(matchedAgent.id)) continue;
    if (!matchFilterRules(domain, requestPath, catalog.filter_rules)) continue;
    matchingCatalogs.push(catalog);
  }

  if (matchingCatalogs.length === 0) {
    return {
      type: "blocked_no_catalog",
      event: {
        domain,
        request_url: requestUrl,
        user_agent_name: matchedAgent.name,
        user_agent_raw: userAgent,
        matched_catalog_id: null,
        decision: "blocked_no_catalog",
        price_applied: null,
        consumer_workspace_id: null,
        timestamp,
      },
    };
  }

  // 5. Pick the catalog with the lowest price
  matchingCatalogs.sort((a, b) => a.price_eur - b.price_eur);
  const bestCatalog = matchingCatalogs[0];

  const event: SdkEvent = {
    domain,
    request_url: requestUrl,
    user_agent_name: matchedAgent.name,
    user_agent_raw: userAgent,
    matched_catalog_id: bestCatalog.id,
    decision: bestCatalog.price_eur <= defaultPrice ? "granted" : "denied",
    price_applied: bestCatalog.price_eur,
    consumer_workspace_id: null,
    timestamp,
  };

  if (bestCatalog.price_eur <= defaultPrice) {
    return {
      type: "granted",
      catalogId: bestCatalog.id,
      price: bestCatalog.price_eur,
      event,
    };
  }

  return {
    type: "denied",
    catalogId: bestCatalog.id,
    price: bestCatalog.price_eur,
    responseBody: {
      status: "licensing_required",
      content: { source_url: requestUrl },
      licensing: {
        catalog_id: bestCatalog.id,
        price_eur: bestCatalog.price_eur,
        currency: "EUR",
      },
    },
    event,
  };
}
