import type { LiquadConfig, IdentityCheckRulesConfig } from "./types";

/**
 * Cached rules structure (mirrors SdkRules from the API).
 *
 * This interface represents the workspace rules fetched from
 * GET /api/sdk/rules and cached locally by the SDK. It includes
 * all information needed for the SDK to make local decisions:
 * - Domain verification status
 * - Bot matching patterns
 * - Catalog pricing rules
 * - Identity Check configuration (new in IC feature)
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
    url_patterns: string[];
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
 * Fetch rules from the Liquad API using Node.js native https/http modules.
 */
function fetchRules(config: LiquadConfig): Promise<CachedRules> {
  const baseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const url = `${baseUrl}/api/sdk/rules`;

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === "https:" ? require("https") : require("http");

    const req = mod.request(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
        },
        timeout: 10_000,
      },
      (res: import("http").IncomingMessage) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Rules fetch failed with status ${res.statusCode}`));
            return;
          }
          try {
            const data = JSON.parse(body) as CachedRules;
            resolve(data);
          } catch {
            reject(new Error("Failed to parse rules response"));
          }
        });
      }
    );

    req.on("error", (err: Error) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Rules fetch timed out"));
    });
    req.end();
  });
}

/**
 * Create a rules cache instance.
 *
 * - Fetches rules on startup (async, non-blocking).
 * - Refreshes rules periodically on a configurable interval.
 * - Serves stale rules if a refresh fails (stale-while-revalidate).
 * - Returns null if no rules have been fetched yet (passthrough mode).
 */
export function createRulesCache(config: LiquadConfig) {
  let rules: CachedRules | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const interval = Math.max(
    config.refreshInterval ?? 300_000,
    MIN_REFRESH_INTERVAL
  );
  const onError = config.onError ?? (() => {});

  async function doRefresh(): Promise<void> {
    try {
      rules = await fetchRules(config);
    } catch (err) {
      onError(
        err instanceof Error ? err : new Error("Unknown error fetching rules")
      );
      // Keep existing rules (stale-while-revalidate)
    }
  }

  return {
    async start(): Promise<void> {
      await doRefresh();
      timer = setInterval(() => {
        void doRefresh();
      }, interval);
    },

    getRules(): CachedRules | null {
      return rules;
    },

    getJwtSecret(): string | null {
      return rules?.jwt_signing_secret ?? null;
    },

    /**
     * Get the Identity Check configuration from cached rules.
     *
     * Returns null if no rules have been fetched yet or if the
     * API response doesn't include IC config (older API version).
     * The SDK uses sensible defaults when null.
     *
     * @returns IC config or null
     */
    getIdentityCheckConfig(): IdentityCheckRulesConfig | null {
      return rules?.identity_check ?? null;
    },

    async refresh(): Promise<void> {
      await doRefresh();
    },

    stop(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
