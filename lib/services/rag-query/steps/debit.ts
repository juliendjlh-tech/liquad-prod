// ---------------------------------------------------------------------------
// Steps 14-15: Verify balance and debit atomically via RPC
// ---------------------------------------------------------------------------

import type { Json } from "@/lib/db/types";
import type { PipelineStep, DebitResult } from "../types";

/**
 * Verify the consumer has sufficient balance and debit atomically.
 *
 * Uses the check_balance_and_debit_batch RPC which performs an atomic
 * balance check and debit in a single transaction. This prevents race
 * conditions with concurrent queries.
 *
 * On insufficient balance, returns a 402 error with balance details.
 * On success, proceeds to the final step.
 */
export const debit: PipelineStep = async (ctx) => {
  const { supabase, consumerWorkspaceId, accumulated } = ctx;

  // Build the debits array for the batch RPC
  const debits = accumulated!.map((r) => ({
    publisher_workspace_id: r.publisher_workspace_id,
    catalog_id: r.catalog_id,
    content_url: r.source_url,
    price_eur: Number(r.price_eur),
  }));

  const { data: debitData, error: debitError } = await supabase.rpc(
    "check_balance_and_debit_batch",
    {
      p_consumer_workspace_id: consumerWorkspaceId!,
      p_debits: debits as unknown as Json,
    }
  );

  if (debitError) {
    return {
      error: "debit_error",
      status: 500,
      details: { message: debitError.message },
    };
  }

  const debitResult = debitData as unknown as DebitResult;

  if (!debitResult.success) {
    return {
      error: "insufficient_balance",
      status: 402,
      details: {
        required: debitResult.required,
        balance: debitResult.balance,
      },
    };
  }

  // Store the new balance for the log-and-return step
  ctx._newBalance = debitResult.new_balance;
};
