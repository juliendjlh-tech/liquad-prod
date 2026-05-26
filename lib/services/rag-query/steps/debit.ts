// ---------------------------------------------------------------------------
// Step 10: Authorize + debit atomically via RPC
//
// Uses the consolidated authorize_and_debit_batch RPC which handles:
//   - Cache check (existing grant per (api_key_id, url) = free reuse)
//   - Network membership check (network_catalogs.status='accepted')
//   - Balance verification + atomic debit
//   - Grant creation + 4-row revenue split into credit_transactions
//
// Since migration 041 the RPC resolves bot_id + ua_pattern from api_keys/bots,
// so debit rows no longer carry them. Revenue split amounts are pre-computed
// in TS (lib/constants/revenue.ts) and passed per row.
// ---------------------------------------------------------------------------

import type { Json } from "@/lib/db/types";
import type { PipelineStep, AuthorizeResult } from "../types";
import { computeRevenueSplit } from "@/lib/constants/revenue";

/**
 * Verify balance, debit atomically, and create grants for each result.
 *
 * Builds the debits array from accumulated results (post-filtering),
 * pre-computing the 3 split amounts per row.
 *
 * On success, stores grants and new balance for the log-and-return step.
 */
export const debit: PipelineStep = async (ctx) => {
  const { supabase, apiKeyId, accumulated, catalogs } = ctx;

  // Build catalog lookup for ttl_minutes
  const catalogTtl = new Map(
    (catalogs ?? []).map((c) => [c.id, c.ttl_minutes])
  );

  const debits = accumulated!.map((r) => {
    const priceEur = Number(r.price_eur);
    const split = computeRevenueSplit(priceEur);
    return {
      publisher_workspace_id: r.publisher_workspace_id,
      catalog_id: r.catalog_id,
      url: r.source_url,
      price_eur: priceEur,
      ttl_minutes: catalogTtl.get(r.catalog_id) ?? 60,
      amount_content_owner: split.content_owner,
      amount_sub_manager: split.sub_manager,
      amount_platform_fee: split.platform_fee,
    };
  });

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "authorize_and_debit_batch",
    {
      p_api_key_id: apiKeyId!,
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
