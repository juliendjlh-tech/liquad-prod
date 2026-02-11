import { z } from "zod";

/**
 * Schema for POST /api/contents/import request body.
 *
 * Validates sitemap import input:
 * - url: Required, must be a valid URL using http or https protocol.
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
});

export type ImportSitemapInput = z.infer<typeof importSitemapSchema>;
