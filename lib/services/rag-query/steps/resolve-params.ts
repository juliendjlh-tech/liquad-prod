// ---------------------------------------------------------------------------
// Step 2: Resolve query parameters (inline > search_config > defaults)
// ---------------------------------------------------------------------------

import type { PipelineStep } from "../types";

/**
 * Merge inline parameters with search_config values.
 *
 * If a search_config_id is provided, loads its values as defaults.
 * Inline parameters always override search_config values.
 *
 * Sets: ctx.catalogIds, ctx.pathFilters, ctx.maxPriceEur,
 *       ctx.totalBudgetEur, ctx.maxResults, ctx.searchConfigId
 */
export const resolveParams: PipelineStep = async (ctx) => {
  const { input, supabase, consumerWorkspaceId } = ctx;

  let catalogIds = input.catalog_ids ?? [];
  let pathFilters = input.path_filters ?? [];
  let maxPriceEur = input.max_price_eur;
  let totalBudgetEur = input.total_budget_eur;
  let maxResults = input.max_results;
  let searchConfigId: string | null = null;

  // If a search_config_id is provided, load its values as defaults
  if (input.search_config_id) {
    searchConfigId = input.search_config_id;

    const { data: config } = await supabase
      .from("search_configs")
      .select("*")
      .eq("id", input.search_config_id)
      .eq("workspace_id", consumerWorkspaceId!)
      .single();

    if (!config) {
      return { error: "search_config_not_found", status: 404 };
    }

    // Load catalog_ids from the junction table
    const { data: configCatalogs } = await supabase
      .from("search_config_catalogs")
      .select("catalog_id")
      .eq("search_config_id", config.id);

    const configCatalogIds = (configCatalogs ?? []).map((c) => c.catalog_id);

    // Inline parameters override search_config values
    if (catalogIds.length === 0) catalogIds = configCatalogIds;
    if (pathFilters.length === 0 && config.path_filters) {
      pathFilters = config.path_filters as unknown as typeof pathFilters;
    }
    if (maxPriceEur === undefined && config.max_price_eur !== null) {
      maxPriceEur = Number(config.max_price_eur);
    }
    if (totalBudgetEur === undefined && config.total_budget_eur !== null) {
      totalBudgetEur = Number(config.total_budget_eur);
    }
    if (input.max_results === 5 && config.max_results) {
      maxResults = config.max_results;
    }
  }

  if (catalogIds.length === 0) {
    return {
      error: "catalog_ids_required",
      status: 422,
      details: { message: "No catalog_ids provided (inline or via search_config)" },
    };
  }

  // Persist resolved values in context
  ctx.catalogIds = catalogIds;
  ctx.pathFilters = pathFilters;
  ctx.maxPriceEur = maxPriceEur;
  ctx.totalBudgetEur = totalBudgetEur;
  ctx.maxResults = maxResults;
  ctx.searchConfigId = searchConfigId;
};
