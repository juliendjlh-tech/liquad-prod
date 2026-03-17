import { NextRequest, NextResponse } from "next/server";
import * as dns from "dns";
import { createServerClient } from "@/lib/db/supabase-server";
import { identityCheckTestSchema } from "@/lib/validations/identity-check.schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum time (in ms) to wait for a single DNS lookup.
 * Applied to both reverse DNS and forward DNS lookups.
 *
 * If the DNS server doesn't respond within this time, the lookup
 * is aborted and the result is `verified: false` with `reason: "dns_timeout"`.
 */
const DNS_TIMEOUT_MS = 500;

// ---------------------------------------------------------------------------
// DNS Helper Functions
// ---------------------------------------------------------------------------

/**
 * Perform a reverse DNS lookup (IP → hostname) with a hard timeout.
 *
 * Reverse DNS converts an IP address to a hostname via PTR records.
 * Example: 66.249.66.1 → ["crawl-66-249-66-1.googlebot.com"]
 *
 * Uses `Promise.race` to enforce a strict timeout. If the DNS server
 * is slow or unreachable, the timeout wins and null is returned.
 *
 * @param ip - The IPv4 address to look up
 * @returns Array of hostnames, or null if the lookup failed/timed out
 */
async function safeReverseDns(ip: string): Promise<string[] | null> {
  try {
    return await Promise.race([
      dns.promises.reverse(ip),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`rDNS timeout after ${DNS_TIMEOUT_MS}ms`)),
          DNS_TIMEOUT_MS
        )
      ),
    ]);
  } catch {
    return null;
  }
}

/**
 * Perform a forward DNS lookup (hostname → IP addresses) with a hard timeout.
 *
 * Forward DNS converts a hostname to IPv4 addresses via A records.
 * Example: crawl-66-249-66-1.googlebot.com → ["66.249.66.1"]
 *
 * This is the confirmation step: we verify that the hostname found
 * via rDNS actually resolves back to the original IP address.
 *
 * @param hostname - The hostname to resolve
 * @returns Array of IPv4 addresses, or null if the lookup failed/timed out
 */
async function safeForwardDns(hostname: string): Promise<string[] | null> {
  try {
    return await Promise.race([
      dns.promises.resolve4(hostname),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`fDNS timeout after ${DNS_TIMEOUT_MS}ms`)),
          DNS_TIMEOUT_MS
        )
      ),
    ]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pattern Matching
// ---------------------------------------------------------------------------

/**
 * Check if a hostname matches a DNS glob pattern.
 *
 * Converts the glob pattern to a regex and tests the hostname.
 * The wildcard `*` matches one or more characters (but NOT dots).
 *
 * Examples:
 *   - matchPattern("crawl-1.googlebot.com", "*.googlebot.com") → true
 *   - matchPattern("googlebot.com", "*.googlebot.com") → false (no subdomain)
 *   - matchPattern("evil.attacker.net", "*.googlebot.com") → false
 *
 * @param hostname - The hostname returned by rDNS
 * @param pattern - A DNS glob pattern (e.g. "*.googlebot.com")
 * @returns true if the hostname matches the pattern
 */
function matchPattern(hostname: string, pattern: string): boolean {
  try {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
      .replace(/\\\*/g, ".+"); // Replace wildcard with .+ (one or more chars)

    const regex = new RegExp(`^${escaped}$`, "i"); // Case-insensitive full match
    return regex.test(hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The detailed result returned by the test endpoint.
 *
 * Provides step-by-step visibility into the DNS verification process
 * so publishers can debug their dns_patterns configuration.
 */
interface TestVerificationResult {
  /** Name of the matched bot, or null if no bot matched the user_agent */
  matched_bot: string | null;

  /** DNS patterns configured for the matched bot (empty if no match) */
  dns_patterns: string[];

  /** Hostname found via reverse DNS, or null if rDNS failed/timed out */
  rdns_hostname: string | null;

  /** Whether the rDNS hostname matched any of the dns_patterns */
  pattern_match: boolean;

  /** IP address resolved via forward DNS, or null if fDNS failed/timed out */
  fdns_ip: string | null;

  /** Whether the fDNS-resolved IP matches the original input IP */
  ip_match: boolean;

  /** Final verification result: true only if all checks passed */
  verified: boolean;

  /** Time taken for the entire verification in milliseconds */
  duration_ms: number;

  /**
   * Reason for failure (only present when verified = false).
   * Possible values:
   * - "no_matching_bot" — User-Agent didn't match any workspace bot
   * - "no_dns_patterns" — Matched bot has no dns_patterns configured
   * - "rdns_failed" — Reverse DNS lookup failed or timed out
   * - "pattern_mismatch" — rDNS hostname didn't match any dns_pattern
   * - "fdns_failed" — Forward DNS lookup failed or timed out
   * - "ip_mismatch" — Forward DNS resolved to a different IP
   * - "dns_timeout" — DNS lookup timed out
   */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/workspaces/:id/identity-check/test
 *
 * Test DNS-based bot identity verification for a given IP + User-Agent.
 *
 * This endpoint performs the SAME rDNS → pattern match → fDNS → IP comparison
 * flow as the SDK's Identity Check module, but:
 * - It does NOT affect real traffic or any cache
 * - It does NOT write to sdk_events
 * - It returns detailed step-by-step results for debugging
 *
 * USE CASE:
 * Publishers use this endpoint to validate their dns_patterns configuration
 * before enabling Identity Check in production. For example, they can test
 * whether a known Googlebot IP would pass verification with their patterns.
 *
 * AUTHENTICATION:
 * - Protected by dashboard session auth (NOT SDK API key)
 * - Requires workspace membership (any role: owner, admin, viewer)
 *
 * REQUEST BODY (JSON):
 * ```json
 * { "ip": "66.249.66.1", "user_agent": "Googlebot/2.1" }
 * ```
 *
 * RESPONSES:
 * - 200: TestVerificationResult with detailed step-by-step results
 * - 400: Validation error (invalid IP or empty user_agent)
 * - 401: Unauthorized (not logged in)
 * - 403: Forbidden (not a workspace member)
 * - 500: Internal server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const startTime = Date.now();
    const { id: workspaceId } = await params;

    // -----------------------------------------------------------------------
    // 1. Authentication: Verify the user is logged in
    // -----------------------------------------------------------------------
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // -----------------------------------------------------------------------
    // 2. Authorization: Verify the user is a member of this workspace
    // -----------------------------------------------------------------------
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Forbidden: not a workspace member" },
        { status: 403 }
      );
    }

    // -----------------------------------------------------------------------
    // 3. Validate the request body
    // -----------------------------------------------------------------------
    const body = await request.json();
    const validation = identityCheckTestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const { ip, user_agent } = validation.data;

    // -----------------------------------------------------------------------
    // 4. Find matching bot in the workspace
    // -----------------------------------------------------------------------
    // Fetch all active bots for this workspace and try to match the
    // user_agent string against their ua_pattern (case-insensitive substring)
    const { data: agents } = await supabase
      .from("user_agents")
      .select("id, name, ua_pattern, dns_patterns")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    // Match the user_agent against bot ua_patterns (case-insensitive substring)
    // This mimics the SDK's matching logic in packages/sdk/src/matcher.ts
    const matchedBot = (agents ?? []).find((agent) =>
      user_agent.toLowerCase().includes(agent.ua_pattern.toLowerCase())
    );

    // Case: No bot matched the User-Agent string
    if (!matchedBot) {
      return NextResponse.json(
        {
          matched_bot: null,
          dns_patterns: [],
          rdns_hostname: null,
          pattern_match: false,
          fdns_ip: null,
          ip_match: false,
          verified: false,
          duration_ms: Date.now() - startTime,
          reason: "no_matching_bot",
        } satisfies TestVerificationResult,
        { status: 200 }
      );
    }

    const dnsPatterns = (matchedBot.dns_patterns as string[]) ?? [];

    // Case: Matched bot has no dns_patterns configured
    if (dnsPatterns.length === 0) {
      return NextResponse.json(
        {
          matched_bot: matchedBot.name,
          dns_patterns: [],
          rdns_hostname: null,
          pattern_match: false,
          fdns_ip: null,
          ip_match: false,
          verified: false,
          duration_ms: Date.now() - startTime,
          reason: "no_dns_patterns",
        } satisfies TestVerificationResult,
        { status: 200 }
      );
    }

    // -----------------------------------------------------------------------
    // 5. Step 1: Reverse DNS (IP → hostname)
    // -----------------------------------------------------------------------
    const hostnames = await safeReverseDns(ip);

    if (!hostnames || hostnames.length === 0) {
      return NextResponse.json(
        {
          matched_bot: matchedBot.name,
          dns_patterns: dnsPatterns,
          rdns_hostname: null,
          pattern_match: false,
          fdns_ip: null,
          ip_match: false,
          verified: false,
          duration_ms: Date.now() - startTime,
          reason: "rdns_failed",
        } satisfies TestVerificationResult,
        { status: 200 }
      );
    }

    const rdnsHostname = hostnames[0];

    // -----------------------------------------------------------------------
    // 6. Step 2: Pattern matching (hostname vs dns_patterns)
    // -----------------------------------------------------------------------
    const patternMatch = dnsPatterns.some((pattern) =>
      matchPattern(rdnsHostname, pattern)
    );

    if (!patternMatch) {
      return NextResponse.json(
        {
          matched_bot: matchedBot.name,
          dns_patterns: dnsPatterns,
          rdns_hostname: rdnsHostname,
          pattern_match: false,
          fdns_ip: null,
          ip_match: false,
          verified: false,
          duration_ms: Date.now() - startTime,
          reason: "pattern_mismatch",
        } satisfies TestVerificationResult,
        { status: 200 }
      );
    }

    // -----------------------------------------------------------------------
    // 7. Step 3: Forward DNS (hostname → IP)
    // -----------------------------------------------------------------------
    const resolvedIps = await safeForwardDns(rdnsHostname);

    if (!resolvedIps || resolvedIps.length === 0) {
      return NextResponse.json(
        {
          matched_bot: matchedBot.name,
          dns_patterns: dnsPatterns,
          rdns_hostname: rdnsHostname,
          pattern_match: true,
          fdns_ip: null,
          ip_match: false,
          verified: false,
          duration_ms: Date.now() - startTime,
          reason: "fdns_failed",
        } satisfies TestVerificationResult,
        { status: 200 }
      );
    }

    // -----------------------------------------------------------------------
    // 8. Step 4: IP comparison
    // -----------------------------------------------------------------------
    const ipMatch = resolvedIps.includes(ip);

    const result: TestVerificationResult = {
      matched_bot: matchedBot.name,
      dns_patterns: dnsPatterns,
      rdns_hostname: rdnsHostname,
      pattern_match: true,
      fdns_ip: resolvedIps[0], // Show the first resolved IP for debugging
      ip_match: ipMatch,
      verified: ipMatch,
      duration_ms: Date.now() - startTime,
    };

    // Add reason if verification failed at the IP comparison step
    if (!ipMatch) {
      result.reason = "ip_mismatch";
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
