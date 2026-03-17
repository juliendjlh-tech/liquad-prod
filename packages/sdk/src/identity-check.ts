/**
 * Identity Check Module — DNS-based Bot Verification
 *
 * This module verifies that a bot's IP address actually belongs to the claimed
 * operator by performing a two-step DNS verification:
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
 * The module includes an in-memory cache to avoid repeated DNS lookups
 * for the same IP+bot combination (DNS lookups are slow: ~50-200ms each).
 *
 * @example
 * ```typescript
 * import { createIdentityChecker } from './identity-check';
 *
 * const checker = createIdentityChecker({
 *   cacheTtlMs: 3600000,    // Cache results for 1 hour
 *   dnsTimeoutMs: 500,       // Timeout DNS lookups after 500ms
 * });
 *
 * checker.start(); // Start periodic cache cleanup
 *
 * const result = await checker.verify(
 *   '66.249.66.1',           // Bot's IP address
 *   'googlebot-123',         // Bot identifier (for cache key)
 *   ['*.googlebot.com', '*.google.com']  // Expected DNS patterns
 * );
 *
 * if (result.verified) {
 *   console.log(`Verified: ${result.hostname}`); // crawl-66-249-66-1.googlebot.com
 * }
 *
 * checker.stop(); // Clean up on shutdown
 * ```
 *
 * @module identity-check
 * @see ADR-003: Identity Check DNS Verification
 */

import * as dns from "dns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the Identity Checker.
 *
 * These values control DNS lookup behavior and cache management.
 * All have sensible defaults if not provided.
 */
export interface IdentityCheckConfig {
  /**
   * How long to cache a verification result (in milliseconds).
   * After this time, a fresh DNS lookup will be performed.
   *
   * Default: 3,600,000 (1 hour)
   *
   * Recommended range: 300,000 (5 min) to 86,400,000 (24 hours).
   * Shorter = more DNS lookups but fresher data.
   * Longer = fewer lookups but stale results if bot IPs change.
   */
  cacheTtlMs?: number;

  /**
   * Maximum time to wait for a single DNS lookup (in milliseconds).
   * If the DNS server doesn't respond within this time, the lookup
   * is considered failed and the bot is marked as unverified.
   *
   * Default: 500 (half a second)
   *
   * Note: Each verification performs up to 2 DNS lookups (rDNS + fDNS),
   * so worst-case latency is 2 × dnsTimeoutMs = 1 second.
   */
  dnsTimeoutMs?: number;

  /**
   * Optional error callback. Called when DNS errors occur.
   * DNS errors are non-fatal — they result in `verified: false`.
   */
  onError?: (error: Error) => void;
}

/**
 * The result of a bot identity verification.
 *
 * This object tells you:
 * - Whether the bot is who it claims to be (`verified`)
 * - What hostname was found via rDNS (`hostname`)
 * - How long the verification took (`durationMs`)
 * - Whether the result came from cache (`cached`)
 */
export interface VerificationResult {
  /** Whether the bot's identity was verified via DNS */
  verified: boolean;

  /**
   * The hostname returned by reverse DNS lookup.
   * Example: "crawl-66-249-66-1.googlebot.com"
   * Null if rDNS failed or timed out.
   */
  hostname: string | null;

  /** How long the verification took in milliseconds */
  durationMs: number;

  /** Whether this result came from the in-memory cache */
  cached: boolean;
}

/**
 * Internal cache entry structure.
 * Stores a verification result along with its timestamp for TTL expiry.
 */
interface CacheEntry {
  /** The cached verification result */
  result: VerificationResult;

  /**
   * When this entry was created (Unix timestamp in ms).
   * Used to determine if the entry has expired (checkedAt + ttl < now).
   */
  checkedAt: number;
}

/**
 * The public interface of an Identity Checker instance.
 *
 * Created by `createIdentityChecker()`. Provides methods to:
 * - `start()`: Begin periodic cache cleanup
 * - `stop()`: Stop cleanup timer and release resources
 * - `verify()`: Perform DNS verification on a bot IP
 */
export interface IdentityChecker {
  /** Start periodic cache cleanup (every 5 minutes) */
  start: () => void;

  /** Stop the cleanup timer. Call this on graceful shutdown. */
  stop: () => void;

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default cache TTL: 1 hour (in milliseconds) */
const DEFAULT_CACHE_TTL_MS = 3_600_000;

/** Default DNS lookup timeout: 500ms */
const DEFAULT_DNS_TIMEOUT_MS = 500;

/** How often to run the cache cleanup sweep (every 5 minutes) */
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Maximum number of entries allowed in the cache.
 * When this limit is reached, the oldest entries are evicted.
 * This prevents memory leaks if the SDK processes many unique IPs.
 */
const MAX_CACHE_ENTRIES = 10_000;

// ---------------------------------------------------------------------------
// Glob Pattern Matcher
// ---------------------------------------------------------------------------

/**
 * Check if a hostname matches a DNS glob pattern.
 *
 * DNS glob patterns use `*` as a wildcard that matches one or more
 * characters (but NOT dots in this implementation — we match full subdomains).
 *
 * Examples:
 *   - `matchDnsPattern("crawl-1.googlebot.com", "*.googlebot.com")` → true
 *   - `matchDnsPattern("googlebot.com", "*.googlebot.com")` → false (no subdomain)
 *   - `matchDnsPattern("evil.googlebot.com.attacker.net", "*.googlebot.com")` → false
 *
 * Implementation: Converts the glob pattern to a regex.
 *   `*.googlebot.com` becomes `/^.+\.googlebot\.com$/i`
 *
 * The `*` wildcard is translated to `.+` (one or more characters),
 * meaning the pattern requires at least one subdomain level.
 *
 * @param hostname - The hostname to check (e.g. from rDNS lookup)
 * @param pattern - A DNS glob pattern (e.g. "*.googlebot.com")
 * @returns true if the hostname matches the pattern
 */
export function matchDnsPattern(hostname: string, pattern: string): boolean {
  try {
    // Escape all regex special characters in the pattern,
    // then replace the escaped wildcard (\*) with .+ (one or more chars)
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape regex specials
      .replace(/\\\*/g, ".+"); // Replace \* with .+ (NOT .* — must match at least 1 char)

    const regex = new RegExp(`^${escaped}$`, "i"); // Case-insensitive, full match
    return regex.test(hostname);
  } catch {
    // If the pattern is somehow invalid, don't crash — just return false
    return false;
  }
}

/**
 * Check if a hostname matches ANY of the provided DNS patterns.
 *
 * This is the multi-pattern version of `matchDnsPattern`.
 * A bot can have multiple valid DNS patterns (e.g. Googlebot uses
 * both *.googlebot.com and *.google.com).
 *
 * @param hostname - The hostname to check
 * @param patterns - Array of DNS glob patterns to match against
 * @returns true if the hostname matches at least one pattern
 */
export function matchAnyDnsPattern(
  hostname: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => matchDnsPattern(hostname, pattern));
}

// ---------------------------------------------------------------------------
// DNS Helpers (with timeout)
// ---------------------------------------------------------------------------

/**
 * Perform a reverse DNS lookup with a timeout.
 *
 * Reverse DNS (rDNS) converts an IP address to a hostname.
 * Example: 66.249.66.1 → ["crawl-66-249-66-1.googlebot.com"]
 *
 * Uses `Promise.race` to enforce a hard timeout. If the DNS server
 * doesn't respond in time, the promise rejects with a timeout error.
 *
 * @param ip - IP address to look up
 * @param timeoutMs - Maximum time to wait (in milliseconds)
 * @returns Array of hostnames (usually just one)
 * @throws Error if the lookup times out or fails
 */
async function reverseDnsWithTimeout(
  ip: string,
  timeoutMs: number
): Promise<string[]> {
  return Promise.race([
    // The actual DNS lookup
    dns.promises.reverse(ip),
    // The timeout — rejects after timeoutMs milliseconds
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`rDNS timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Perform a forward DNS lookup (A record) with a timeout.
 *
 * Forward DNS (fDNS) converts a hostname to IP address(es).
 * Example: crawl-66-249-66-1.googlebot.com → ["66.249.66.1"]
 *
 * This is the second step of verification: we confirm that the
 * hostname (from rDNS) resolves back to the original IP.
 *
 * @param hostname - Hostname to resolve
 * @param timeoutMs - Maximum time to wait (in milliseconds)
 * @returns Array of IPv4 addresses
 * @throws Error if the lookup times out or fails
 */
async function forwardDnsWithTimeout(
  hostname: string,
  timeoutMs: number
): Promise<string[]> {
  return Promise.race([
    // The actual DNS lookup (resolve4 = IPv4 A records)
    dns.promises.resolve4(hostname),
    // The timeout
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`fDNS timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create an Identity Checker instance.
 *
 * The Identity Checker performs DNS-based bot verification and maintains
 * an in-memory cache to avoid repeated DNS lookups.
 *
 * **Lifecycle:**
 * 1. Call `createIdentityChecker(config)` to create an instance
 * 2. Call `checker.start()` to begin periodic cache cleanup
 * 3. Call `checker.verify(ip, botId, patterns)` to verify bots
 * 4. Call `checker.stop()` on shutdown to release resources
 *
 * **Cache behavior:**
 * - Cache key: `${ip}:${botId}` (unique per IP + bot combination)
 * - TTL: configurable (default 1 hour)
 * - Max entries: 10,000 (oldest evicted when full)
 * - Cleanup: every 5 minutes, expired entries are removed
 *
 * **Error handling:**
 * This module NEVER throws exceptions. All DNS errors are caught and
 * returned as `{ verified: false }`. This ensures the SDK never crashes
 * due to DNS issues.
 *
 * @param config - Optional configuration overrides
 * @returns An IdentityChecker instance with start/stop/verify methods
 */
export function createIdentityChecker(
  config: IdentityCheckConfig = {}
): IdentityChecker {
  // ---------------------------------------------------------------------------
  // Configuration with defaults
  // ---------------------------------------------------------------------------
  const cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const dnsTimeoutMs = config.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  const onError = config.onError ?? (() => {});

  // ---------------------------------------------------------------------------
  // In-memory cache
  // ---------------------------------------------------------------------------
  // Map<cacheKey, CacheEntry> where cacheKey = "${ip}:${botId}"
  // Using a Map ensures O(1) lookup and preserves insertion order.
  const cache = new Map<string, CacheEntry>();

  // Timer for periodic cache cleanup
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // ---------------------------------------------------------------------------
  // Cache Management
  // ---------------------------------------------------------------------------

  /**
   * Remove expired entries from the cache.
   *
   * Called periodically (every 5 minutes) to prevent memory buildup.
   * Iterates the entire cache and deletes entries older than the TTL.
   */
  function cleanupExpiredEntries(): void {
    const now = Date.now();

    for (const [key, entry] of cache.entries()) {
      if (now - entry.checkedAt > cacheTtlMs) {
        cache.delete(key);
      }
    }
  }

  /**
   * Evict the oldest entries if the cache exceeds the maximum size.
   *
   * This uses the fact that Map preserves insertion order: the first
   * entries in the iterator are the oldest ones.
   *
   * Called after each new cache insertion to enforce the 10,000 limit.
   */
  function evictIfOverCapacity(): void {
    if (cache.size <= MAX_CACHE_ENTRIES) return;

    // Calculate how many entries to remove
    const entriesToRemove = cache.size - MAX_CACHE_ENTRIES;
    const keysToDelete: string[] = [];

    // Collect the oldest keys (first N entries in the Map)
    let count = 0;
    for (const key of cache.keys()) {
      if (count >= entriesToRemove) break;
      keysToDelete.push(key);
      count++;
    }

    // Delete the collected keys
    for (const key of keysToDelete) {
      cache.delete(key);
    }
  }

  // ---------------------------------------------------------------------------
  // Core Verification Logic
  // ---------------------------------------------------------------------------

  /**
   * Verify a bot's identity via DNS.
   *
   * The verification flow is:
   *
   * ```
   * 1. Check cache → if hit and not expired → return cached result
   *                                         ↓
   * 2. Reverse DNS: IP → hostname
   *    (e.g. 66.249.66.1 → crawl-66-249-66-1.googlebot.com)
   *                                         ↓
   * 3. Pattern match: hostname vs dns_patterns
   *    (e.g. crawl-66-249-66-1.googlebot.com matches *.googlebot.com ?)
   *                                         ↓
   * 4. Forward DNS: hostname → IP
   *    (e.g. crawl-66-249-66-1.googlebot.com → 66.249.66.1)
   *                                         ↓
   * 5. IP comparison: does the resolved IP match the original IP?
   *                                         ↓
   * 6. Cache result and return
   * ```
   *
   * If ANY step fails, the result is `{ verified: false }`.
   *
   * @param ip - The bot's IP address (IPv4, e.g. "66.249.66.1")
   * @param botId - Unique identifier for cache key (e.g. bot's UUID)
   * @param dnsPatterns - Expected hostname patterns (e.g. ["*.googlebot.com"])
   * @returns VerificationResult with verified status and metadata
   */
  async function verify(
    ip: string,
    botId: string,
    dnsPatterns: string[]
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      // -----------------------------------------------------------------------
      // Step 1: Check the cache
      // -----------------------------------------------------------------------
      const cacheKey = `${ip}:${botId}`;
      const cached = cache.get(cacheKey);

      if (cached && Date.now() - cached.checkedAt <= cacheTtlMs) {
        // Cache hit — return the stored result without any DNS lookup
        return {
          ...cached.result,
          cached: true,
          durationMs: Date.now() - startTime,
        };
      }

      // Cache miss or expired — perform fresh DNS verification

      // -----------------------------------------------------------------------
      // Step 2: Reverse DNS lookup (IP → hostname)
      // -----------------------------------------------------------------------
      let hostnames: string[];
      try {
        hostnames = await reverseDnsWithTimeout(ip, dnsTimeoutMs);
      } catch (err) {
        // rDNS failed (timeout, NXDOMAIN, network error, etc.)
        // This means we can't determine who owns this IP → unverified
        onError(
          err instanceof Error
            ? err
            : new Error(`rDNS failed for ${ip}`)
        );

        const failResult: VerificationResult = {
          verified: false,
          hostname: null,
          durationMs: Date.now() - startTime,
          cached: false,
        };

        // Cache the failure so we don't keep retrying the same bad IP
        cache.set(cacheKey, { result: failResult, checkedAt: Date.now() });
        evictIfOverCapacity();

        return failResult;
      }

      // rDNS can return multiple hostnames; use the first one
      // (most DNS servers return only one PTR record for an IP)
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

      // -----------------------------------------------------------------------
      // Step 3: Pattern matching (hostname vs dns_patterns)
      // -----------------------------------------------------------------------
      // Check if the rDNS hostname matches any of the expected patterns.
      // Example: "crawl-1.googlebot.com" should match "*.googlebot.com"
      if (!matchAnyDnsPattern(hostname, dnsPatterns)) {
        // Hostname doesn't match any expected pattern → likely spoofed
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

      // -----------------------------------------------------------------------
      // Step 4: Forward DNS lookup (hostname → IP)
      // -----------------------------------------------------------------------
      let resolvedIps: string[];
      try {
        resolvedIps = await forwardDnsWithTimeout(hostname, dnsTimeoutMs);
      } catch (err) {
        // fDNS failed — can't confirm the hostname resolves to this IP
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

      // -----------------------------------------------------------------------
      // Step 5: IP comparison
      // -----------------------------------------------------------------------
      // The hostname's resolved IP(s) must include the original IP.
      // If not, someone may have a hostname that matches the pattern but
      // points to a different IP (unlikely but theoretically possible).
      const ipMatches = resolvedIps.includes(ip);

      const finalResult: VerificationResult = {
        verified: ipMatches,
        hostname,
        durationMs: Date.now() - startTime,
        cached: false,
      };

      // -----------------------------------------------------------------------
      // Step 6: Cache the result
      // -----------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    /**
     * Start the periodic cache cleanup timer.
     *
     * The timer runs every 5 minutes and removes expired cache entries.
     * Call this once at SDK initialization.
     */
    start(): void {
      if (cleanupTimer !== null) return; // Already started

      cleanupTimer = setInterval(cleanupExpiredEntries, CACHE_CLEANUP_INTERVAL_MS);

      // Ensure the timer doesn't prevent Node.js from exiting
      // (unref allows the process to exit even if the timer is still active)
      if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
        (cleanupTimer as NodeJS.Timeout).unref();
      }
    },

    /**
     * Stop the periodic cache cleanup timer.
     *
     * Call this during graceful shutdown to release resources.
     * Does NOT clear the cache — just stops the cleanup timer.
     */
    stop(): void {
      if (cleanupTimer !== null) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    },

    verify,
  };
}
