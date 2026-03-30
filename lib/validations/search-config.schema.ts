import { z } from "zod";

// ---------------------------------------------------------------------------
// SearchConfig Schemas
// ---------------------------------------------------------------------------

// Path filter operator (same as catalog filter_rules)
const pathFilterSchema = z.object({
  operator: z.enum([
    "contains",
    "not_contains",
    "starts_with",
    "not_starts_with",
    "equals",
    "ends_with",
  ]),
  value: z.string().min(1),
});

/**
 * Schema for POST /api/search-configs request body.
 * Creates a new SearchConfig preset for the consumer.
 */
export const createSearchConfigSchema = z.object({
  name: z.string().min(1, "name is required").max(100),
  catalog_ids: z.array(z.string().uuid()).min(1, "at least one catalog_id is required"),
  path_filters: z.array(pathFilterSchema).default([]),
  max_price_eur: z.number().min(0).max(1).optional(),
  total_budget_eur: z.number().min(0).optional(),
  max_results: z.number().int().min(1).max(20).default(5),
});

export type CreateSearchConfigInput = z.infer<typeof createSearchConfigSchema>;

/**
 * Schema for PATCH /api/search-configs/:id request body.
 * All fields are optional (partial update).
 */
export const updateSearchConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  catalog_ids: z.array(z.string().uuid()).min(1).optional(),
  path_filters: z.array(pathFilterSchema).optional(),
  max_price_eur: z.number().min(0).max(1).nullable().optional(),
  total_budget_eur: z.number().min(0).nullable().optional(),
  max_results: z.number().int().min(1).max(20).optional(),
});

export type UpdateSearchConfigInput = z.infer<typeof updateSearchConfigSchema>;
