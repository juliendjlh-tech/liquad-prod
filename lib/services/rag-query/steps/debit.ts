// ---------------------------------------------------------------------------
// Step 10: Authorize + debit atomically via RPC
//
// Uses the consolidated authorize_and_debit_batch RPC which handles:
//   - Cache check (existing grant = free reuse)
//   - Balance verification + atomic debit
//   - Grant creation with agent_id + ua_pattern
// ---------------------------------------------------------------------------

import type { Json } from "@/lib/db/types";
import type { PipelineStep, AuthorizeResult } from "../types";

/**
 * Verify balance, debit atomically, and create grants for each result.
 *
 * Builds the debits array from accumulated results (post-filtering),
 * including agent_id, ua_pattern, and ttl_minutes from the matched catalog.
 *
 * On success, stores grants and new balance for the log-and-return step.
 */
export const debit: PipelineStep = async (ctx) => {
  const { supabase, consumerWorkspaceId, accumulated, agentId, uaPattern, catalogs } = ctx;

  // Build catalog lookup for ttl_minutes
  const catalogTtl = new Map(
    (catalogs ?? []).map((c) => [c.id, c.ttl_minutes])
  );

  const debits = accumulated!.map((r) => ({
    publisher_workspace_id: r.publisher_workspace_id,
    catalog_id: r.catalog_id,
    agent_id: agentId!,
    ua_pattern: uaPattern!,
    url: r.source_url,
    price_eur: Number(r.price_eur),
    ttl_minutes: catalogTtl.get(r.catalog_id) ?? 60,
  }));

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "authorize_and_debit_batch",
    {
      p_consumer_id: consumerWorkspaceId!,
      p_debits: debits as unknown as Json,
    }
  );

  if (rpcError) {
    return {
      error: "debit_error",
      status: 500,
      details: { message: rpcError.message },
    };
  }

  const result = rpcData as unknown as AuthorizeResult;

  if (!result.success) {
    return {
      error: "insufficient_balance",
      status: 402,
      details: {
        required: result.required,
        balance: result.balance,
      },
    };
  }

  ctx._newBalance = result.new_balance;
  ctx._grants = result.grants;
};
