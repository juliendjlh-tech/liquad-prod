import { z } from "zod";
import { pathRuleSchema } from "./catalog.schema";

/**
 * Schema for POST /api/contents/import request body.
 *
 * Validates sitemap import input:
 * - url: Required, must be a valid URL using http or https protocol.
 * - path_rules: Optional array of path filter rules.
 * - path_logic: Optional "AND" | "OR" logic for combining path rules.
 * - max_pages: Optional positive integer cap on pages to import.
 *
 * Used by:
 * - `app/api/contents/import/route.ts` — POST import handler
 */
export const importSitemapSchema = z.object({
  url: z
    .url("Invalid URL format")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "URL must use http or https protocol"
    ),
  path_rules: z.array(pathRuleSchema).optional(),
  path_logic: z.enum(["AND", "OR"]).default("AND").optional(),
  max_pages: z.number().int().positive().optional(),
});

export type ImportSitemapInput = z.infer<typeof importSitemapSchema>;
