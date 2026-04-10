// ---------------------------------------------------------------------------
// Steps 11-12: Accumulate by relevance until budget reached, then cap
// ---------------------------------------------------------------------------

import type { PipelineStep } from "../types";
import { logQuery } from "../helpers";

/**
 * Accumulate results by relevance (best distance first) until
 * total_budget_eur is reached, then cap at max_results.
 *
 * Results are already sorted by distance from the vector search.
 * This step enforces the consumer's budget and result count limits.
 *
 * Sets ctx.accumulated and ctx.totalCost.
 * Returns empty success if no results pass the budget filter.
 */
export const budgetCap: PipelineStep = async (ctx) => {
  const { searchResults, totalBudgetEur, maxResults, supabase } = ctx;

  // Accumulate by relevance until budget is reached
  const accumulated = [];
  let runningCost = 0;

  for (const result of searchResults!) {
    const price = Number(result.price_eur);
    if (totalBudgetEur !== undefined && runningCost + price > totalBudgetEur) {
      break; // Budget would be exceeded
    }
    accumulated.push(result);
    runningCost += price;
  }

  // Cap at max_results
  const capped = accumulated.slice(0, maxResults!);

  // Recalculate total cost after capping
  const totalCost = capped.reduce((sum, r) => sum + Number(r.price_eur), 0);

  if (capped.length === 0) {
    // No results after budget/cap filtering — log and return empty
    await logQuery(supabase, ctx.consumerWorkspaceId!, ctx.input, ctx.searchConfigId ?? null, 0, []);
    return {
      results: [],
      total_cost_eur: 0,
      balance_remaining_eur: 0,
    };
  }

  ctx.accumulated = capped;
  ctx.totalCost = totalCost;
};
