/**
 * IP Range Check — CIDR-based bot IP verification
 *
 * Used to verify that a request IP belongs to the declared ranges
 * for a known bot operator, without performing a DNS lookup.
 * Much faster than DNS-based Identity Check (0ms vs ~20-100ms).
 *
 * Supports:
 *   - IPv4 CIDR ranges (e.g. "23.102.140.0/23")
 *   - Exact IPv4 match (e.g. "203.0.113.1")
 *
 * IPv6 is not currently supported — returns false for IPv6 addresses.
 */

// ---------------------------------------------------------------------------
// IPv4 CIDR matching
// ---------------------------------------------------------------------------

/**
 * Convert a dotted-decimal IPv4 address to a 32-bit unsigned integer.
 * e.g. "192.168.1.1" → 3232235777
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return NaN;

  return parts.reduce((acc, octet) => {
    const n = parseInt(octet, 10);
    if (isNaN(n) || n < 0 || n > 255) return NaN;
    return (acc << 8) + n;
  }, 0) >>> 0; // >>> 0 converts to unsigned 32-bit
}

/**
 * Check if an IPv4 address falls within a CIDR range.
 *
 * @param ip   - Client IP, e.g. "23.102.140.5"
 * @param cidr - CIDR range, e.g. "23.102.140.0/23"
 * @returns true if `ip` is within `cidr`
 */
function isIpv4InCidr(ip: string, cidr: string): boolean {
  const slashIndex = cidr.indexOf("/");
  if (slashIndex === -1) {
    // No prefix — treat as exact match
    return ip === cidr;
  }

  const network = cidr.slice(0, slashIndex);
  const prefix = parseInt(cidr.slice(slashIndex + 1), 10);

  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  // Build the network mask (all 1s shifted left by (32 - prefix))
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);

  if (isNaN(ipInt) || isNaN(netInt)) return false;

  return (ipInt & mask) === (netInt & mask);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a given IP address is within any of the provided CIDR ranges.
 *
 * Entries in `ranges` can be:
 *   - CIDR notation: "23.102.140.0/23"
 *   - Exact IP:      "203.0.113.1"
 *
 * IPv6 addresses are not matched — returns false silently.
 *
 * @param ip     - The client IP address to check
 * @param ranges - Array of CIDR ranges or exact IPs
 * @returns true if `ip` is within at least one entry in `ranges`
 */
export function isIpInRanges(ip: string, ranges: string[]): boolean {
  if (!ip || ranges.length === 0) return false;

  // Skip IPv6 (contains ":")
  if (ip.includes(":")) return false;

  return ranges.some((range) => {
    try {
      return isIpv4InCidr(ip, range);
    } catch {
      return false;
    }
  });
}
