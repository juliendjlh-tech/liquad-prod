/**
 * Identity Check Module — DNS-based Bot Verification via DNS-over-HTTPS
 *
 * This module verifies that a bot's IP address actually belongs to the claimed
 * operator by performing a two-step DNS verification using DoH (DNS-over-HTTPS):
 *
 *   1. **Reverse DNS (rDNS)**: Look up the IP address to get a hostname
 *      Example: 66.249.66.1 → crawl-66-249-66-1.googlebot.com
 *
 *   2. **Forward DNS (fDNS)**: Resolve the hostname back to an IP address
 *      and confirm it matches the original IP.
 *      Example: crawl-66-249-66-1.googlebot.com → 66.249.66.1 ✓
 *
 * This prevents IP spoofing: an attacker can fake a User-Agent header
 * (e.g. "Googlebot"), but they cannot fake DNS records.
 *
 * Uses Cloudflare's public DoH resolver (cloudflare-dns.com/dns-query)
 * via standard fetch(). Works identically on Node.js 18+, Cloudflare Workers,
 * and Vercel Edge Functions — no Node.js dns module needed.
 *
 * The module includes an in-memory cache to avoid repeated DNS lookups
 * for the same IP+bot combination (DNS lookups are slow: ~20-100ms each).
 *
 * @module identity-check
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the Identity Checker.
 */
export interface IdentityCheckConfig {
  /** How long to cache a verification result (ms). Default: 3,600,000 (1 hour) */
  cacheTtlMs?: number;

  /** Maximum time to wait for a DNS lookup (ms). Default: 500 */
  dnsTimeoutMs?: number;

  /** Optional error callback. DNS errors are non-fatal — they result in verified: false. */
  onError?: (error: Error) => void;
}

/**
 * The result of a bot identity verification.
 */
export interface VerificationResult {
  /** Whether the bot's identity was verified via DNS */
  verified: boolean;

  /** The hostname returned by reverse DNS lookup. Null if rDNS failed. */
  hostname: string | null;

  /** How long the verification took in milliseconds */
  durationMs: number;

  /** Whether this result came from the in-memory cache */
  cached: boolean;
}

/**
 * The public interface of an Identity Checker instance.
 */
export interface IdentityChecker {
  /**
   * Verify a bot's identity via DNS.
   *
   * @param ip - The bot's IP address (e.g. "66.249.66.1")
   * @param botId - A unique identifier for the bot (used as cache key)
   * @param dnsPatterns - Expected DNS hostname patterns (e.g. ["*.googlebot.com"])
   * @returns A VerificationResult indicating pass/fail
   */
  verify: (
    ip: string,
    botId: string,
    dnsPatterns: string[]
  ) => Promise<VerificationResult>;
}

/** Internal cache entry structure. */
interface CacheEntry {
  result: VerificationResult;
  checkedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_TTL_MS = 3_600_000; // 1 hour
const DEFAULT_DNS_TIMEOUT_MS = 500;
const MAX_CACHE_ENTRIES = 10_000;
const DOH_RESOLVER = "https://cloudflare-dns.com/dns-query";

// ---------------------------------------------------------------------------
// Glob Pattern Matcher
// ---------------------------------------------------------------------------

/**
 * Check if a hostname matches a DNS glob pattern.
 *
 * DNS glob patterns use `*` as a wildcard that matches one or more characters.
 *
 * Examples:
 *   - `matchDnsPattern("crawl-1.googlebot.com", "*.googlebot.com")` → true
 *   - `matchDnsPattern("googlebot.com", "*.googlebot.com")` → false (no subdomain)
 *   - `matchDnsPattern("evil.googlebot.com.attacker.net", "*.googlebot.com")` → false
 */
export function matchDnsPattern(hostname: string, pattern: string): boolean {
  try {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\*/g, ".+");

    const regex = new RegExp(`^${escaped}$`, "i");
    return regex.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Check if a hostname matches ANY of the provided DNS patterns.
 */
export function matchAnyDnsPattern(
  hostname: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => matchDnsPattern(hostname, pattern));
}

// ---------------------------------------------------------------------------
// DNS-over-HTTPS Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an IPv4 address to the in-addr.arpa format for PTR lookups.
 * Example: "66.249.66.1" → "1.66.249.66.in-addr.arpa"
 */
function ipToArpa(ip: string): string {
  return ip.split(".").reverse().join(".") + ".in-addr.arpa";
}

/**
 * Perform a reverse DNS lookup via DNS-over-HTTPS.
 * Returns hostnames for the given IP address (PTR records).
 */
async function reverseDns(
  ip: string,
  timeoutMs: number
): Promise<string[]> {
  const resp = await fetch(
    `${DOH_RESOLVER}?name=${ipToArpa(ip)}&type=PTR`,
    {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  if (!resp.ok) return [];

  const data = await resp.json();
  return ((data as { Answer?: Array<{ type: number; data: string }> }).Answer ?? [])
    .filter((a) => a.type === 12) // PTR = type 12
    .map((a) => a.data.replace(/\.$/, "")); // remove trailing dot
}

/**
 * Perform a forward DNS lookup via DNS-over-HTTPS.
 * Returns IPv4 addresses for the given hostname (A records).
 */
async function forwardDns(
  hostname: string,
  timeoutMs: number
): Promise<string[]> {
  const resp = await fetch(
    `${DOH_RESOLVER}?name=${hostname}&type=A`,
    {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  if (!resp.ok) return [];

  const data = await resp.json();
  return ((data as { Answer?: Array<{ type: number; data: string }> }).Answer ?? [])
    .filter((a) => a.type === 1) // A = type 1
    .map((a) => a.data);
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create an Identity Checker instance.
 *
 * The Identity Checker performs DNS-based bot verification using DoH
 * (DNS-over-HTTPS) and maintains an in-memory cache to avoid repeated lookups.
 *
 * No timers or background tasks — cache cleanup is done lazily on access.
 * Works identically on Node.js, Cloudflare Workers, and Vercel Edge.
 *
 * @param config - Optional configuration overrides
 * @returns An IdentityChecker instance
 */
export function createIdentityChecker(
  config: IdentityCheckConfig = {}
): IdentityChecker {
  const cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const dnsTimeoutMs = config.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  const onError = config.onError ?? (() => {});

  const cache = new Map<string, CacheEntry>();

  /**
   * Evict oldest entries if the cache exceeds the maximum size.
   */
  function evictIfOverCapacity(): void {
    if (cache.size <= MAX_CACHE_ENTRIES) return;

    const entriesToRemove = cache.size - MAX_CACHE_ENTRIES;
    const keysToDelete: string[] = [];

    let count = 0;
    for (const key of cache.keys()) {
      if (count >= entriesToRemove) break;
      keysToDelete.push(key);
      count++;
    }

    for (const key of keysToDelete) {
      cache.delete(key);
    }
  }

  /**
   * Verify a bot's identity via DNS-over-HTTPS.
   *
   * Flow:
   * 1. Check cache → if hit and not expired → return cached result
   * 2. Reverse DNS: IP → hostname (via DoH)
   * 3. Pattern match: hostname vs dns_patterns
   * 4. Forward DNS: hostname → IP (via DoH)
   * 5. IP comparison: does the resolved IP match the original IP?
   * 6. Cache result and return
   */
  async function verify(
    ip: string,
    botId: string,
    dnsPatterns: string[]
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // Step 1: Check cache (lazy expiry — expired entries are simply re-fetched)
      const cacheKey = `${ip}:${botId}`;
      const cached = cache.get(cacheKey);

      if (cached && Date.now() - cached.checkedAt <= cacheTtlMs) {
        return {
          ...cached.result,
          cached: true,
          durationMs: Date.now() - startTime,
        };
      }

      // Step 2: Reverse DNS (IP → hostname)
      let hostnames: string[];
      try {
        hostnames = await reverseDns(ip, dnsTimeoutMs);
      } catch (err) {
        onError(
          err instanceof Error ? err : new Error(`rDNS failed for ${ip}`)
        );

        const failResult: VerificationResult = {
          verified: false,
          hostname: null,
          durationMs: Date.now() - startTime,
          cached: false,
        };

        cache.set(cacheKey, { result: failResult, checkedAt: Date.now() });
        evictIfOverCapacity();
        return failResult;
      }

      if (hostnames.length === 0) {
        const failResult: VerificationResult = {
          verified: false,
          hostname: null,
          durationMs: Date.now() - startTime,
          cached: false,
        };
        cache.set(cacheKey, { result: failResult, checkedAt: Date.now() });
        evictIfOverCapacity();
        return failResult;
      }

      const hostname = hostnames[0];

      // Step 3: Pattern matching
      if (!matchAnyDnsPattern(hostname, dnsPatterns)) {
        const failResult: VerificationResult = {
          verified: false,
          hostname,
          durationMs: Date.now() - startTime,
          cached: false,
        };
        cache.set(cacheKey, { result: failResult, checkedAt: Date.now() });
        evictIfOverCapacity();
        return failResult;
      }

      // Step 4: Forward DNS (hostname → IP)
      let resolvedIps: string[];
      try {
        resolvedIps = await forwardDns(hostname, dnsTimeoutMs);
      } catch (err) {
        onError(
          err instanceof Error
            ? err
            : new Error(`fDNS failed for ${hostname}`)
        );

        const failResult: VerificationResult = {
          verified: false,
          hostname,
          durationMs: Date.now() - startTime,
          cached: false,
        };
        cache.set(cacheKey, { result: failResult, checkedAt: Date.now() });
        evictIfOverCapacity();
        return failResult;
      }

      // Step 5: IP comparison
      const ipMatches = resolvedIps.includes(ip);

      const finalResult: VerificationResult = {
        verified: ipMatches,
        hostname,
        durationMs: Date.now() - startTime,
        cached: false,
      };

      // Step 6: Cache
      cache.set(cacheKey, { result: finalResult, checkedAt: Date.now() });
      evictIfOverCapacity();

      return finalResult;
    } catch (err) {
      // Catch-all safety net: this module must NEVER throw
      onError(
        err instanceof Error
          ? err
          : new Error("Unexpected error in identity check")
      );

      return {
        verified: false,
        hostname: null,
        durationMs: Date.now() - startTime,
        cached: false,
      };
    }
  }

  return { verify };
}
