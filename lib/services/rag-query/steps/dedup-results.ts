// ---------------------------------------------------------------------------
// Steps 8-9: Deduplicate by indexed_source_id and apply price selection
//
// Keeps the best chunk per source URL (lowest distance = highest relevance).
// If the same URL appears via different catalogs, the best score wins.
// ---------------------------------------------------------------------------

import type { PipelineStep, VectorSearchRow } from "../types";

/**
 * Deduplicate vector search results by indexed_source_id, keeping the
 * chunk with the best (lowest) distance for each source.
 *
 * Updates ctx.searchResults with the deduped array.
 */
export const dedupResults: PipelineStep = async (ctx) => {
  const bestBySource = new Map<string, VectorSearchRow>();

  for (const result of ctx.searchResults!) {
    const existing = bestBySource.get(result.indexed_source_id);
    if (!existing || result.distance < existing.distance) {
      bestBySource.set(result.indexed_source_id, result);
    }
  }

  // Replace searchResults with deduped version for downstream steps
  ctx.searchResults = [...bestBySource.values()];
};
