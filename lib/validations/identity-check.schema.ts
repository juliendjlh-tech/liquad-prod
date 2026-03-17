import { z } from "zod";

// ---------------------------------------------------------------------------
// Identity Check Test Input Schema
// ---------------------------------------------------------------------------

/**
 * Regular expression for validating IPv4 addresses.
 *
 * Matches strings like "192.168.1.1" or "66.249.66.1".
 * Each octet must be 0-255 (the regex is permissive; the refine below
 * does the actual range check for correctness).
 *
 * NOTE: This intentionally does NOT support IPv6 for the test endpoint.
 * The SDK's Identity Check module strips `::ffff:` prefixes from
 * IPv4-mapped IPv6 addresses before verification, so the test endpoint
 * only needs to accept pure IPv4.
 */
const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Schema for POST /api/workspaces/:id/identity-check/test request body.
 *
 * Validates the test input for the Identity Check test endpoint:
 *
 * - ip: Required, must be a valid IPv4 address (e.g. "66.249.66.1").
 *   The IP is verified by both regex and range checks (each octet 0-255).
 *
 * - user_agent: Required, non-empty string representing a User-Agent header
 *   (e.g. "GPTBot/1.0" or "Mozilla/5.0 ... Googlebot ...").
 *   This is matched against the workspace's declared bots to find
 *   the corresponding dns_patterns for verification.
 *
 * Used by:
 * - `app/api/workspaces/[id]/identity-check/test/route.ts` — POST handler
 *
 * @example
 * ```typescript
 * const result = identityCheckTestSchema.safeParse({
 *   ip: "66.249.66.1",
 *   user_agent: "GPTBot/1.0"
 * });
 * if (result.success) {
 *   // result.data.ip = "66.249.66.1"
 *   // result.data.user_agent = "GPTBot/1.0"
 * }
 * ```
 */
export const identityCheckTestSchema = z.object({
  ip: z
    .string()
    .trim()
    .min(1, "ip is required")
    .regex(IPV4_REGEX, "ip must be a valid IPv4 address (e.g. 66.249.66.1)")
    .refine(
      (ip) => {
        // Validate each octet is in the 0-255 range
        const octets = ip.split(".");
        return octets.every((octet) => {
          const num = parseInt(octet, 10);
          return num >= 0 && num <= 255;
        });
      },
      { message: "Each IP octet must be between 0 and 255" }
    ),

  user_agent: z
    .string()
    .trim()
    .min(1, "user_agent is required"),
});

/**
 * TypeScript type inferred from the identity check test schema.
 *
 * Fields:
 * - ip: A validated IPv4 address string
 * - user_agent: A non-empty User-Agent string
 */
export type IdentityCheckTestInput = z.infer<typeof identityCheckTestSchema>;
