// ---------------------------------------------------------------------------
// Steps 10-10b: Apply path_filters and max_price_eur filtering
// ---------------------------------------------------------------------------

import { evaluatePathRule } from "@/lib/validations/catalog.schema";
import type { PipelineStep } from "../types";

/**
 * Apply optional path_filters (OR logic) and max_price_eur filtering
 * on the deduped search results.
 *
 * Path filters use OR logic: at least one filter must match.
 * A consumer typically passes multiple path prefixes to broaden scope
 * (e.g., "/docs/api/*" OR "/docs/guides/*").
 *
 * Updates ctx.searchResults with the filtered array.
 */
export const applyFilters: PipelineStep = async (ctx) => {
  let results = ctx.searchResults!;

  // Step 10: Apply path_filters (OR logic)
  if (ctx.pathFilters && ctx.pathFilters.length > 0) {
    const pathFilters = ctx.pathFilters;
    results = results.filter((r) => {
      try {
        const pathname = new URL(r.source_url).pathname;
        return pathFilters.some((f) => evaluatePathRule(pathname, f));
      } catch {
        return false;
      }
    });
  }

  // Step 10b: Filter by max_price_eur
  if (ctx.maxPriceEur !== undefined) {
    const maxPrice = ctx.maxPriceEur;
    results = results.filter((r) => Number(r.price_eur) <= maxPrice);
  }

  ctx.searchResults = results;
};
