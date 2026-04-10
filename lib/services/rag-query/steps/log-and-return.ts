// ---------------------------------------------------------------------------
// Steps 16-17: Log the query and return final results
// ---------------------------------------------------------------------------

import type { PipelineStep, QueryResultItem } from "../types";
import { logQuery } from "../helpers";

/**
 * Log the query to rag_query_logs for consumer history and return
 * the final results with full snippets and heading context.
 *
 * Returns a QuerySuccess result, ending the pipeline.
 */
export const logAndReturn: PipelineStep = async (ctx) => {
  const { supabase, consumerWorkspaceId, accumulated, totalCost, input, searchConfigId } = ctx;

  // Build structured log results for traceability
  const logResults = accumulated!.map((r) => ({
    source_url: r.source_url,
    catalog_id: r.catalog_id,
    price_eur: Number(r.price_eur),
    score: Math.round((1 - r.distance) * 10000) / 10000,
  }));

  await logQuery(supabase, consumerWorkspaceId!, input, searchConfigId ?? null, totalCost!, logResults);

  // Build the consumer-facing results with snippets
  const finalResults: QueryResultItem[] = accumulated!.map((r) => ({
    url: r.source_url,
    catalog_id: r.catalog_id,
    catalog_name: r.catalog_name,
    price_eur: Number(r.price_eur),
    score: Math.round((1 - r.distance) * 10000) / 10000,
    snippet: r.chunk_text,
    heading_context: r.heading_context,
  }));

  // Retrieve the new balance set by the debit step
  const newBalance = ctx._newBalance!;

  return {
    results: finalResults,
    total_cost_eur: Math.round(totalCost! * 10000) / 10000,
    balance_remaining_eur: newBalance,
  };
};
