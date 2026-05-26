// ---------------------------------------------------------------------------
// RAG Query Pipeline — Public API
//
// Composes the 11 pipeline steps into the executeRagQuery function.
//
// Pipeline steps (in order):
//   1. authenticate     — Validate API key, extract workspace ID
//   2. resolveParams    — Merge inline + search_config parameters
//   3. validateCatalogs — Verify catalogs are active + RAG-enabled
//   4. matchBots        — Resolve bot by ID, ua_pattern reconciliation
//   5. embedQuery       — Generate vector embedding for query text
//   6. vectorSearch     — Execute pgvector similarity search
//   7. dedupResults     — Keep best chunk per source URL
//   8. applyFilters     — Apply path_filters and max_price_eur
//   9. budgetCap        — Accumulate until budget, cap at max_results
//  10. debit            — Authorize + debit atomically (cache + grants)
//  11. logAndReturn     — Sign tokens, log query, return results
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import type { QueryInput } from "@/lib/validations/query.schema";
import type { QueryResult, RagQueryContext } from "./types";
import { runPipeline } from "./pipeline";

// Import all step functions
import { authenticate } from "./steps/authenticate";
import { resolveParams } from "./steps/resolve-params";
import { validateCatalogs } from "./steps/validate-catalogs";
import { matchBots } from "./steps/match-agents";
import { embedQuery } from "./steps/embed-query";
import { vectorSearch } from "./steps/vector-search";
import { dedupResults } from "./steps/dedup-results";
import { applyFilters } from "./steps/apply-filters";
import { budgetCap } from "./steps/budget-cap";
import { debit } from "./steps/debit";
import { logAndReturn } from "./steps/log-and-return";

// Re-export types for external consumers
export type { QueryResult, QueryResultItem, QuerySuccess, QueryDryRun, QueryError } from "./types";

/**
 * Execute a RAG semantic search query.
 *
 * This is the main entry point for POST /api/public/v1/consumer/query.
 * Internally, it runs an 11-step pipeline where each step either
 * advances the context or short-circuits with a typed result.
 *
 * CRITICAL: This function NEVER throws. All errors are returned as typed results.
 *
 * @param authHeader - Authorization header (Bearer lq_...)
 * @param input - Validated query input (includes bot_id)
 * @returns Typed result: success, dry_run, or error
 */
export async function executeRagQuery(
  authHeader: string | null,
  input: QueryInput
): Promise<QueryResult> {
  const supabase = await createServerClient();

  const ctx: RagQueryContext = {
    authHeader,
    input,
    supabase,
  };

  return runPipeline(ctx, [
    authenticate,
    resolveParams,
    validateCatalogs,
    matchBots,
    embedQuery,
    vectorSearch,
    dedupResults,
    applyFilters,
    budgetCap,
    debit,
    logAndReturn,
  ]);
}
