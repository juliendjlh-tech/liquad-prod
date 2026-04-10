// ---------------------------------------------------------------------------
// RAG Query Pipeline — Shared helpers
//
// Utility functions used by multiple pipeline steps.
// ---------------------------------------------------------------------------

import type { createServerClient } from "@/lib/db/supabase-server";
import type { QueryInput } from "@/lib/validations/query.schema";
import type { Json } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structured result stored in the rag_query_logs.results JSONB column. */
interface LogResultItem {
  source_url: string;
  catalog_id: string;
  price_eur: number;
  score: number;
}

// ---------------------------------------------------------------------------
// Query Logging
// ---------------------------------------------------------------------------

/**
 * Log a RAG query to rag_query_logs for consumer history and analytics.
 *
 * Called by vector-search (empty results), budget-cap (empty after filtering),
 * and log-and-return (successful query).
 *
 * @param supabase - Supabase client instance
 * @param consumerWorkspaceId - The consumer workspace that made the query
 * @param input - The original query input
 * @param searchConfigId - The search config used (null if inline params)
 * @param totalCost - Total cost debited for this query
 * @param results - Structured result items for traceability
 */
export async function logQuery(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  consumerWorkspaceId: string,
  input: QueryInput,
  searchConfigId: string | null,
  totalCost: number,
  results: LogResultItem[]
): Promise<void> {
  await supabase.from("rag_query_logs").insert({
    consumer_workspace_id: consumerWorkspaceId,
    query_text: input.query,
    search_config_id: searchConfigId,
    total_cost_eur: totalCost,
    results: results as unknown as Json,
  });
}
