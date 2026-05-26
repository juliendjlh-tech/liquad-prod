import type { LiquadConfig } from "./types";
import type { MatchableCatalog } from "./matcher";

/**
 * Cached rules structure (mirrors WorkspaceRules from the API).
 *
 * Contains everything the SDK needs for local decisions:
 * - HMAC secret for token verification
 * - Bot matching patterns with default behavior
 * - Identity Check IP ranges
 * - Free catalogs (price_eur=0) for local URL matching
 */
export interface CachedRules {
  workspace_id: string;
  /** Publisher's HMAC signing secret for local token verification */
  hmac_secret: string;
  verified_domains: string[];

  bots: Array<{
    id: string;
    name: string;
    ua_pattern: string;
    /** Official IP ranges (CIDR) declared by the bot operator */
    declared_ips: string[];
    /** Catalog IDs this bot is linked to */
    catalog_ids: string[];
  }>;

  /** Free catalogs (price_eur=0) with resolved filter_rules for local matching */
  catalogs: MatchableCatalog[];
}

const MIN_REFRESH_INTERVAL = 10_000; // 10s minimum

/**
 * Fetch rules from the Liquad API using the Fetch API.
 */
async function fetchRules(config: LiquadConfig): Promise<CachedRules> {
  const baseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const url = `${baseUrl}/api/public/v1/sdk/rules`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`Rules fetch failed with status ${resp.status}`);
  }

  return (await resp.json()) as CachedRules;
}

/**
 * Create a rules cache instance.
 *
 * Uses lazy stale-while-revalidate: rules are fetched on the first call
 * to getOrRefresh(), then served from memory until the refresh interval
 * expires. No setInterval — works identically in Node.js and edge runtimes.
 *
 * If a refresh fails, stale rules are kept (stale-while-revalidate).
 * Returns null if no rules have ever been fetched successfully.
 */
export function createRulesCache(config: LiquadConfig) {
  let rules: CachedRules | null = null;
  let lastFetchedAt = 0;
  const interval = Math.max(
    config.refreshInterval ?? 300_000,
    MIN_REFRESH_INTERVAL
  );
  const onError = config.onError ?? (() => {});

  return {
    async getOrRefresh(): Promise<CachedRules | null> {
      if (rules && Date.now() - lastFetchedAt < interval) {
        return rules;
      }

      try {
        rules = await fetchRules(config);
        lastFetchedAt = Date.now();
      } catch (err) {
        onError(
          err instanceof Error
            ? err
            : new Error("Unknown error fetching rules")
        );
      }

      return rules;
    },
  };
}
