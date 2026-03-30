import { z } from "zod";
import { pathRuleSchema } from "./catalog.schema";

/**
 * Schema for POST /api/contents/import request body.
 *
 * This is the single entry point for both initial import and re-indexing.
 *
 * - domain_id: Required. The domain to import content for. The backend reads
 *   domains.sitemap_url (single source of truth) instead of accepting a raw URL.
 * - reindex: When true, existing content matching the path_rules (or all content
 *   if no filters) is wiped before re-importing. Default false = import new only.
 * - path_rules: Optional array of path filter rules applied to sitemap URLs.
 * - path_logic: "AND" | "OR" logic for combining rules. Default "AND".
 * - max_pages: Optional positive integer cap on pages to import.
 *
 * Used by:
 * - `app/api/contents/import/route.ts` — POST import handler
 */
export const importSitemapSchema = z.object({
  domain_id: z.string().uuid("domain_id must be a valid UUID"),
  reindex: z.boolean().default(false),
  path_rules: z.array(pathRuleSchema).optional(),
  path_logic: z.enum(["AND", "OR"]).default("AND").optional(),
  max_pages: z.number().int().positive().optional(),
});

export type ImportSitemapInput = z.infer<typeof importSitemapSchema>;
