// ---------------------------------------------------------------------------
// RAG Query Pipeline — Types
//
// Shared type definitions for the pipeline context, step functions,
// and result types. The context accumulates state as it flows through
// named step functions.
// ---------------------------------------------------------------------------

import type { QueryInput } from "@/lib/validations/query.schema";
import type { PathRule } from "@/lib/validations/catalog.schema";
import type { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// Result Types (public API — unchanged from original)
// ---------------------------------------------------------------------------

/** A single result returned to the consumer. */
export interface QueryResultItem {
  url: string;
  token: string;
  catalog_id: string;
  catalog_name: string;
  price_eur: number;
  score: number;
  expires_at: string;
  cached: boolean;
  snippet?: string;
  heading_context?: string;
}

/** Successful query response. */
export interface QuerySuccess {
  results: QueryResultItem[];
  total_cost_eur: number;
  balance_remaining_eur: number;
}

/** Grant info returned by the authorize RPC, attached to each result. */
export interface GrantInfo {
  grant_id: string;
  expires_at: string;
  cached: boolean;
}

/** Successful dry-run response (no snippets, no debit). */
export interface QueryDryRun {
  dry_run: true;
  disclaimer: string;
  results: Array<{
    url: string;
    catalog_id: string;
    price_eur: number;
    score: number;
  }>;
  estimated_cost_eur: number;
}

/** Error response (typed, never thrown). */
export interface QueryError {
  error: string;
  status: number;
  details?: Record<string, unknown>;
}

/** Union of all possible query results. */
export type QueryResult = QuerySuccess | QueryDryRun | QueryError;

// ---------------------------------------------------------------------------
// RPC Types
// ---------------------------------------------------------------------------

export interface AuthorizeGrantResult {
  url: string;
  grant_id: string;
  expires_at: string;
  cached: boolean;
}

export interface AuthorizeSuccess {
  success: true;
  new_balance: number;
  grants: AuthorizeGrantResult[];
}

export interface AuthorizeFailure {
  success: false;
  reason: string;
  balance: number;
  required: number;
}

export type AuthorizeResult = AuthorizeSuccess | AuthorizeFailure;

// ---------------------------------------------------------------------------
// Vector Search Row (returned by the vector_search RPC)
// ---------------------------------------------------------------------------

export interface VectorSearchRow {
  chunk_id: string;
  indexed_source_id: string;
  source_url: string;
  catalog_id: string;
  catalog_name: string;
  publisher_workspace_id: string;
  price_eur: number;
  distance: number;
  chunk_text: string;
  heading_context: string;
}

// ---------------------------------------------------------------------------
// Pipeline Context
//
// Accumulates state as it flows through step functions.
// Each step reads from and writes to this mutable context.
// ---------------------------------------------------------------------------

export interface RagQueryContext {
  // --- Inputs (set before pipeline starts) ---
  authHeader: string | null;
  input: QueryInput;
  supabase: Awaited<ReturnType<typeof createServerClient>>;

  // --- Accumulated state (set by steps) ---

  /** Consumer workspace ID (set by authenticate step) */
  consumerWorkspaceId?: string;

  /** API key ID used for this request (set by authenticate step) */
  apiKeyId?: string;

  /** Resolved bot info (set by match-agents step) */
  botId?: string;
  uaPattern?: string;

  /** Resolved catalog IDs after merging inline + search_config (set by resolve-params) */
  catalogIds?: string[];

  /** Path filters from inline params or search_config */
  pathFilters?: PathRule[];

  /** Max price per result in EUR */
  maxPriceEur?: number;

  /** Total budget for the query in EUR */
  totalBudgetEur?: number;

  /** Maximum number of results to return */
  maxResults?: number;

  /** Search config ID used (for logging) */
  searchConfigId?: string | null;

  /** Catalog rows fetched from DB (set by validate-catalogs) */
  catalogs?: Array<{
    id: string;
    name: string;
    workspace_id: string;
    price_eur: number;
    ttl_minutes: number | null;
    status: string;
    rag_enabled: boolean;
  }>;

  /** Catalog IDs that passed UA matching (set by match-agents) */
  validCatalogIds?: string[];

  /** Query embedding vector (set by embed-query) */
  queryEmbedding?: number[];

  /** Raw vector search results (set by vector-search) */
  searchResults?: VectorSearchRow[];

  /** Deduped + filtered results (set by dedup, apply-filters, budget-cap) */
  accumulated?: VectorSearchRow[];

  /** Total cost of accumulated results (set by budget-cap) */
  totalCost?: number;

  /** Final query result — set by the last step to short-circuit with a result */
  finalResult?: QueryResult;

  /** New balance after debit — set by debit step, read by log-and-return */
  _newBalance?: number;

  /** Grants returned by authorize RPC (set by debit step, read by log-and-return) */
  _grants?: AuthorizeGrantResult[];
}

// ---------------------------------------------------------------------------
// Pipeline Step
//
// A step either:
//   - Mutates the context and returns void (continue to next step)
//   - Returns a QueryResult to short-circuit the pipeline (error or early return)
// ---------------------------------------------------------------------------

export type PipelineStep = (ctx: RagQueryContext) => Promise<QueryResult | void>;
