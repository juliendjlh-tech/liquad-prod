import { z } from "zod";

// ---------------------------------------------------------------------------
// Filter Rules Schema
// ---------------------------------------------------------------------------

const pathOperatorEnum = z.enum([
  "contains",
  "not_contains",
  "starts_with",
  "not_starts_with",
  "equals",
  "ends_with",
]);

export type PathOperator = z.infer<typeof pathOperatorEnum>;

export const pathRuleSchema = z.object({
  operator: pathOperatorEnum,
  value: z.string().trim().min(1, "value must not be empty").max(500),
});

export type PathRule = z.infer<typeof pathRuleSchema>;

const domainRuleSchema = z.object({
  domain_id: z.string().uuid(),
  path_rules: z.array(pathRuleSchema).optional(),
  path_logic: z.enum(["AND", "OR"]).default("AND").optional(),
});

export type DomainRule = z.infer<typeof domainRuleSchema>;

const filterRulesSchema = z.object({
  domain_rules: z.array(domainRuleSchema).min(1, "at least one domain rule is required"),
});

export type FilterRules = z.infer<typeof filterRulesSchema>;

// ---------------------------------------------------------------------------
// Matching Logic (shared between preview service and can be imported by SDK)
// ---------------------------------------------------------------------------

/**
 * Evaluate a single path rule against a pathname.
 */
export function evaluatePathRule(pathname: string, rule: PathRule): boolean {
  switch (rule.operator) {
    case "contains":
      return pathname.includes(rule.value);
    case "not_contains":
      return !pathname.includes(rule.value);
    case "starts_with":
      return pathname.startsWith(rule.value);
    case "not_starts_with":
      return !pathname.startsWith(rule.value);
    case "equals":
      return pathname === rule.value;
    case "ends_with":
      return pathname.endsWith(rule.value);
  }
}

/**
 * Match a content URL against filter rules.
 *
 * Algorithm:
 * 1. Find domain rules matching the content's hostname
 * 2. Evaluate path_rules according to path_logic (AND/OR)
 *
 * @param hostname - The content's hostname (e.g. "example.com")
 * @param pathname - The content's pathname (e.g. "/blog/article-1")
 * @param filterRules - The filter rules to match against
 * @param domainMap - Map of domain_id to hostname for resolving domain_rules
 */
export function matchContentAgainstRules(
  hostname: string,
  pathname: string,
  filterRules: FilterRules,
  domainMap: Map<string, string>
): boolean {
  // 1. Find domain rules matching the hostname
  const matchingRules = filterRules.domain_rules.filter((r) => {
    const ruleHostname = domainMap.get(r.domain_id);
    return ruleHostname === hostname;
  });
  if (matchingRules.length === 0) return false;

  // 2. Evaluate path_rules
  for (const rule of matchingRules) {
    if (!rule.path_rules || rule.path_rules.length === 0) return true;

    const logic = rule.path_logic ?? "AND";
    const matches =
      logic === "AND"
        ? rule.path_rules.every((pr) => evaluatePathRule(pathname, pr))
        : rule.path_rules.some((pr) => evaluatePathRule(pathname, pr));

    if (matches) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Catalog Schemas
// ---------------------------------------------------------------------------

/**
 * Schema for POST /api/catalogs request body.
 */
export const createCatalogSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(255),
  description: z.string().max(1000).optional(),
  filter_rules: filterRulesSchema,
  bot_ids: z.array(z.string().uuid()),
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
 */
export const updateCatalogSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  filter_rules: filterRulesSchema.optional(),
  bot_ids: z.array(z.string().uuid()).optional(),
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
  // RAG opt-in: when true, content chunks are linked to this catalog
  // for semantic search. When false, links are removed.
  rag_enabled: z.boolean().optional(),
});

export type UpdateCatalogInput = z.infer<typeof updateCatalogSchema>;

/**
 * Schema for POST /api/catalogs/preview request body.
 */
export const previewFilterRulesSchema = z.object({
  filter_rules: filterRulesSchema,
});

export type PreviewFilterRulesInput = z.infer<typeof previewFilterRulesSchema>;
