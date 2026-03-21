import type {
  LiquadConfig,
  IdentityCheckRulesConfig,
  CatalogFilterRules,
} from "./types";

/**
 * Cached rules structure (mirrors SdkRules from the API).
 *
 * This interface represents the workspace rules fetched from
 * GET /api/sdk/rules and cached locally by the SDK. It includes
 * all information needed for the SDK to make local decisions:
 * - Domain verification status
 * - Bot matching patterns
 * - Catalog pricing rules
 * - Identity Check configuration
 */
export interface CachedRules {
  workspace_id: string;
  jwt_signing_secret: string;
  verified_domains: string[];

  /** Active user-agents with dns_patterns for Identity Check */
  user_agents: Array<{
    id: string;
    name: string;
    ua_pattern: string;
    /**
     * DNS hostname glob patterns for Identity Check.
     * Example: ["*.openai.com"]
     * Empty array = Identity Check skipped for this bot.
     */
    dns_patterns: string[];
  }>;

  catalogs: Array<{
    id: string;
    name: string;
    filter_rules: CatalogFilterRules;
    price_eur: number;
    agent_ids: string[];
  }>;

  /**
   * Identity Check configuration for this workspace.
   *
   * Provides DNS verification timeout/cache settings.
   * IC is always active — per-bot `dns_patterns` controls verification.
   *
   * This field may be absent in rules fetched from older API versions.
   * The SDK uses sensible defaults if missing.
   */
  identity_check?: IdentityCheckRulesConfig;
}

const MIN_REFRESH_INTERVAL = 10_000; // 10s minimum

/**
 * Fetch rules from the Liquad API using the Fetch API.
 */
async function fetchRules(config: LiquadConfig): Promise<CachedRules> {
  const baseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const url = `${baseUrl}/api/sdk/rules`;

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
    /**
     * Get rules from cache, or fetch them if stale/missing.
     * This is the only way to access rules — no separate start() needed.
     */
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
        // Keep existing rules (stale-while-revalidate)
      }

      return rules;
    },

    getJwtSecret(): string | null {
      return rules?.jwt_signing_secret ?? null;
    },

    getIdentityCheckConfig(): IdentityCheckRulesConfig | null {
      return rules?.identity_check ?? null;
    },
  };
}
