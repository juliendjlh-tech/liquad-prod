import { z } from "zod";

/**
 * Validates that a string is a valid regex and safe from ReDoS.
 *
 * Tests the pattern against a pathological probe string ("a" x 50)
 * with a 100ms timeout. If the regex takes too long, it is rejected
 * as a potential ReDoS vector.
 *
 * @param pattern - The regex pattern string to validate
 * @returns true if the pattern is valid and safe
 */
function isRegexSafe(pattern: string): boolean {
  try {
    const regex = new RegExp(pattern);
    const probeString = "a".repeat(50);
    const startTime = Date.now();
    regex.test(probeString);
    const elapsed = Date.now() - startTime;
    return elapsed <= 100;
  } catch {
    return false;
  }
}

/** Reusable Zod schema for a safe regex pattern string. */
const safeRegexPattern = z
  .string()
  .min(1, "Pattern must not be empty")
  .refine(
    (pattern) => {
      try {
        new RegExp(pattern);
        return true;
      } catch {
        return false;
      }
    },
    { message: "invalid regular expression" }
  )
  .refine(
    (pattern) => isRegexSafe(pattern),
    { message: "regex pattern timed out during validation (potential ReDoS)" }
  );

/**
 * Schema for POST /api/catalogs request body.
 *
 * Validates catalog creation input:
 * - name: Required, non-empty, trimmed, max 255 chars.
 * - description: Optional, max 1000 chars.
 * - url_patterns: Required array, 1-50 elements, each a valid ReDoS-safe regex.
 * - agent_ids: Required array (can be empty), each a UUID string.
 * - price_eur: Required, 0-1 EUR, max 2 decimal places.
 *
 * Used by:
 * - `app/api/catalogs/route.ts` — POST handler
 */
export const createCatalogSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(255),
  description: z.string().max(1000).optional(),
  url_patterns: z
    .array(safeRegexPattern)
    .min(1, "url_patterns must contain at least one pattern")
    .max(50),
  agent_ids: z.array(z.string().uuid()),
  price_eur: z
    .number()
    .min(0, "price_eur must be between 0 and 1")
    .max(1, "price_eur must be between 0 and 1")
    .multipleOf(0.01, "price_eur must have at most 2 decimal places"),
});

export type CreateCatalogInput = z.infer<typeof createCatalogSchema>;

/**
 * Schema for PATCH /api/catalogs/:id request body.
 * All fields optional (partial update).
 *
 * Used by:
 * - `app/api/catalogs/[id]/route.ts` — PATCH handler
 */
export const updateCatalogSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  url_patterns: z
    .array(safeRegexPattern)
    .min(1, "url_patterns must contain at least one pattern")
    .max(50)
    .optional(),
  agent_ids: z.array(z.string().uuid()).optional(),
  price_eur: z
    .number()
    .min(0, "price_eur must be between 0 and 1")
    .max(1, "price_eur must be between 0 and 1")
    .multipleOf(0.01, "price_eur must have at most 2 decimal places")
    .optional(),
  status: z
    .enum(["active", "inactive"], {
      error: "status must be 'active' or 'inactive'",
    })
    .optional(),
});

export type UpdateCatalogInput = z.infer<typeof updateCatalogSchema>;

/**
 * Schema for POST /api/catalogs/preview request body (ad-hoc preview).
 *
 * Used by:
 * - `app/api/catalogs/preview/route.ts` — POST handler
 */
export const previewPatternsSchema = z.object({
  url_patterns: z
    .array(safeRegexPattern)
    .min(1, "url_patterns must contain at least one pattern")
    .max(50),
});

export type PreviewPatternsInput = z.infer<typeof previewPatternsSchema>;
