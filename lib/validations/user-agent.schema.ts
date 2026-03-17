import { z } from "zod";

// ---------------------------------------------------------------------------
// DNS Pattern Validation
// ---------------------------------------------------------------------------

/**
 * Validates a single DNS hostname glob pattern.
 *
 * A valid DNS pattern must:
 *   1. Be a non-empty string (after trimming whitespace)
 *   2. Contain at least one dot (e.g. "*.openai.com" — not just "*")
 *   3. Only contain valid DNS characters plus the wildcard "*"
 *
 * Valid examples:   "*.openai.com", "*.search.msn.com", "crawler.google.com"
 * Invalid examples: "", "openai", "*.com" (too broad), "foo bar.com" (spaces)
 *
 * The regex allows: letters, digits, hyphens, dots, and asterisks.
 * This covers all valid DNS hostnames plus the glob wildcard.
 */
const dnsPatternSchema = z
  .string()
  .trim()
  .min(1, "DNS pattern must not be empty")
  .regex(
    /^[a-zA-Z0-9.*-]+$/,
    "DNS pattern can only contain letters, digits, dots, hyphens, and wildcards (*)"
  )
  .refine(
    (pattern) => pattern.includes("."),
    "DNS pattern must contain at least one dot (e.g. *.openai.com)"
  );

/**
 * Optional array of DNS hostname glob patterns for Identity Check.
 *
 * Used in both create and update schemas. Defaults to an empty array
 * if not provided, ensuring backward compatibility with existing clients
 * that don't know about dns_patterns.
 *
 * Each pattern is validated individually by dnsPatternSchema.
 */
const dnsPatterns = z.array(dnsPatternSchema).optional().default([]);

// ---------------------------------------------------------------------------
// Create Schema
// ---------------------------------------------------------------------------

/**
 * Schema for POST /api/user-agents request body.
 *
 * Validates user-agent creation input:
 * - name: Required, non-empty, trimmed, max 100 chars.
 * - ua_pattern: Required, non-empty, max 500 chars.
 * - is_preset: Optional boolean (default false).
 * - dns_patterns: Optional array of DNS hostname globs for Identity Check.
 *   Defaults to [] if not provided (backward compatible).
 *
 * Used by:
 * - `app/api/user-agents/route.ts` — POST create handler
 */
export const createUserAgentSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  ua_pattern: z.string().trim().min(1, "ua_pattern is required").max(500),
  is_preset: z.boolean().optional().default(false),
  dns_patterns: dnsPatterns,
});

export type CreateUserAgentInput = z.infer<typeof createUserAgentSchema>;

// ---------------------------------------------------------------------------
// Update Schema
// ---------------------------------------------------------------------------

/**
 * Schema for PATCH /api/user-agents/:id request body.
 *
 * All fields optional — partial update.
 * Includes:
 * - is_active: Toggle bot on/off
 * - dns_patterns: Update DNS verification patterns for Identity Check
 *
 * Used by:
 * - `app/api/user-agents/[id]/route.ts` — PATCH update handler
 */
export const updateUserAgentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  ua_pattern: z.string().trim().min(1).max(500).optional(),
  is_active: z.boolean().optional(),
  dns_patterns: z.array(dnsPatternSchema).optional(),
});

export type UpdateUserAgentInput = z.infer<typeof updateUserAgentSchema>;
