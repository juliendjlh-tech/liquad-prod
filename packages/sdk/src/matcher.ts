import type { CachedRules } from "./rules-cache";
import type { SdkEvent } from "./event-buffer";

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
 * Match a request URL path against catalog URL patterns (regex).
 */
export function matchUrlPatterns(
  requestPath: string,
  urlPatterns: string[]
): boolean {
  for (const pattern of urlPatterns) {
    try {
      const regex = new RegExp(pattern);
      if (regex.test(requestPath)) {
        return true;
      }
    } catch {
      // Invalid regex — skip this pattern
    }
  }
  return false;
}

/**
 * Match an incoming request against the cached rules and return a decision.
 *
 * Algorithm:
 * 1. Extract domain from host. If NOT in verified_domains → passthrough.
 * 2. Match user-agent against declared agents. If no match → passthrough.
 * 3. Find first catalog that:
 *    a. Has the matched agent in its agent_ids
 *    b. Has url_patterns matching the request path
 * 4. If catalog found:
 *    - price <= defaultPrice → granted
 *    - price > defaultPrice → denied (402)
 * 5. If no catalog matches → blocked_no_catalog (403)
 */
export function matchRequest(
  rules: CachedRules,
  request: { url: string; host: string; userAgent: string },
  defaultPrice: number
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

  // 4. Find first matching catalog (already ordered by created_at ASC)
  for (const catalog of rules.catalogs) {
    // Check if this agent is authorized in this catalog
    if (!catalog.agent_ids.includes(matchedAgent.id)) {
      continue;
    }

    // Check if URL matches catalog patterns
    if (!matchUrlPatterns(requestPath, catalog.url_patterns)) {
      continue;
    }

    // Catalog matched — check price
    const event: SdkEvent = {
      domain,
      request_url: requestUrl,
      user_agent_name: matchedAgent.name,
      user_agent_raw: userAgent,
      matched_catalog_id: catalog.id,
      decision: catalog.price_eur <= defaultPrice ? "granted" : "denied",
      price_applied: catalog.price_eur,
      timestamp,
    };

    if (catalog.price_eur <= defaultPrice) {
      return {
        type: "granted",
        catalogId: catalog.id,
        price: catalog.price_eur,
        event,
      };
    }

    return {
      type: "denied",
      catalogId: catalog.id,
      price: catalog.price_eur,
      responseBody: {
        status: "licensing_required",
        content: { source_url: requestUrl },
        licensing: {
          catalog_id: catalog.id,
          price_eur: catalog.price_eur,
          currency: "EUR",
        },
      },
      event,
    };
  }

  // 5. No catalog matches — blocked
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
      timestamp,
    },
  };
}
