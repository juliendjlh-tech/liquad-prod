// ---------------------------------------------------------------------------
// Step 7: Vector search via pgvector (cosine similarity)
// ---------------------------------------------------------------------------

import type { PipelineStep } from "../types";
import { logQuery } from "../helpers";

/**
 * Execute a vector similarity search against the pgvector index.
 *
 * Over-fetches by 3x to have room for dedup, price, and budget filtering
 * in subsequent steps. If no results are found, logs the query and
 * returns an empty success response.
 *
 * Sets ctx.searchResults on success.
 */
export const vectorSearch: PipelineStep = async (ctx) => {
  const { supabase, queryEmbedding, validCatalogIds, maxResults } = ctx;

  // Over-fetch to accommodate post-search filtering
  const searchLimit = maxResults! * 3;

  const { data: searchResults, error: searchError } = await supabase.rpc(
    "vector_search",
    {
      p_query_embedding: `[${queryEmbedding!.join(",")}]`,
      p_catalog_ids: validCatalogIds!,
      p_limit: searchLimit,
    }
  );

  if (searchError) {
    return {
      error: "search_error",
      status: 500,
      details: { message: searchError.message },
    };
  }

  if (!searchResults || searchResults.length === 0) {
    // No results found — log the query and return empty success
    await logQuery(supabase, ctx.consumerWorkspaceId!, ctx.input, ctx.searchConfigId ?? null, 0, []);
    return {
      results: [],
      total_cost_eur: 0,
      balance_remaining_eur: 0,
    };
  }

  ctx.searchResults = searchResults;
};
