import type { LiquadConfig } from "./types";

/**
 * Cached rules structure (mirrors SdkRules from the API).
 */
export interface CachedRules {
  workspace_id: string;
  verified_domains: string[];
  user_agents: Array<{
    id: string;
    name: string;
    ua_pattern: string;
  }>;
  catalogs: Array<{
    id: string;
    name: string;
    url_patterns: string[];
    price_eur: number;
    agent_ids: string[];
  }>;
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
