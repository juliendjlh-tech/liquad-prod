import { z } from "zod";
import { pathRuleSchema } from "@/lib/validations/catalog.schema";
import { publicId } from "@/lib/validations/ids";

// ---------------------------------------------------------------------------
// RAG Query Schema
// ---------------------------------------------------------------------------

/**
 * Schema for POST /api/public/v1/consumer/query request body.
 *
 * The consumer can either reference a saved SearchConfig (by ID) or pass
 * parameters inline. Inline parameters override SearchConfig values.
 * At least one of search_config_id or catalog_ids must be provided.
 */
export const querySchema = z
  .object({
    // The natural language query to search for
    query: z.string().min(1, "query is required").max(2000),

    // public_id of the bot performing the query — used for authorization,
    // cache lookup, grant creation, and token signing
    bot_id: publicId("bot"),

    // Reference a saved SearchConfig (optional)
    search_config_id: publicId("sc").optional(),

    // Inline parameters (optional — override SearchConfig if both provided)
    catalog_ids: z.array(publicId("cat")).optional(),

    // Path filters to narrow down results (same format as catalog filter_rules)
    path_filters: z
      .array(
        z.object({
          operator: z.enum([
            "contains",
            "not_contains",
            "starts_with",
            "not_starts_with",
            "equals",
            "ends_with",
          ]),
          value: z.string().min(1),
        })
      )
      .optional(),

    // Maximum price per individual result (EUR)
    max_price_eur: z.number().min(0).max(1).optional(),

    // Maximum total budget for the entire query (EUR)
    total_budget_eur: z.number().min(0).optional(),

    // Maximum number of results to return (1-20, default 5)
    max_results: z.number().int().min(1).max(20).default(5),

    // If true, return result metadata without snippets and without debiting.
    // Not stored in rag_query_logs — kept as a runtime-only parameter.
    dry_run: z.boolean().default(false),
  })
  .refine(
    (data) => data.search_config_id || (data.catalog_ids && data.catalog_ids.length > 0),
    {
      message: "Either search_config_id or catalog_ids is required",
      path: ["catalog_ids"],
    }
  );

export type QueryInput = z.infer<typeof querySchema>;

// Re-export pathRuleSchema for use in query service
export { pathRuleSchema };
