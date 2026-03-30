-- ============================================================================
-- Migration 014: Batch Debit RPC for RAG Queries
-- ============================================================================
--
-- Creates the check_balance_and_debit_batch function used by the RAG query
-- endpoint. Unlike the single-item check_cache_and_debit (migration 005),
-- this function handles multiple debits in one atomic transaction.
--
-- A RAG query returns N results from potentially different publishers/catalogs.
-- Each result is billed separately, but the total must be debited atomically
-- to prevent partial charges if the balance runs out mid-query.
--
-- REFERENCES:
--   - PRD: PRDs/prd-rag.md (Section 7)
--   - Pattern: check_cache_and_debit in migration 005
-- ============================================================================


-- ============================================================================
-- FUNCTION: check_balance_and_debit_batch
-- ============================================================================
-- Atomic RPC for RAG query billing:
--   1. Calculate total cost from all debits
--   2. Lock consumer workspace row (prevents concurrent debits)
--   3. Verify balance >= total cost
--   4. Debit the full amount
--   5. Insert one credit_transaction per result
--   6. Return success with new balance, or failure with current balance
--
-- Parameters:
--   p_consumer_workspace_id: UUID of the consumer making the query
--   p_debits: JSONB array of objects, each with:
--     - publisher_workspace_id (UUID): the publisher who owns the content
--     - catalog_id (UUID): which catalog the result came from
--     - content_url (TEXT): the source URL of the matched content
--     - price_eur (NUMERIC): the price for this individual result
--
-- Returns JSONB:
--   On success: { success: true, new_balance: number }
--   On failure: { success: false, reason: "insufficient_balance",
--                 balance: number, required: number }

CREATE OR REPLACE FUNCTION public.check_balance_and_debit_batch(
  p_consumer_workspace_id UUID,
  p_debits JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_cost NUMERIC;
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
  v_debit JSONB;
BEGIN
  -- 1. Calculate the total cost by summing all individual prices
  SELECT COALESCE(SUM((d->>'price_eur')::NUMERIC), 0)
  INTO v_total_cost
  FROM jsonb_array_elements(p_debits) AS d;

  -- If no debits or zero total, return success without touching the balance
  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_current_balance
    FROM public.workspaces WHERE id = p_consumer_workspace_id;

    RETURN jsonb_build_object(
      'success', true,
      'new_balance', v_current_balance
    );
  END IF;

  -- 2. Lock the consumer workspace row to prevent concurrent debits
  -- FOR UPDATE ensures no other transaction can modify balance_eur until
  -- this transaction completes (serializes concurrent RAG queries)
  SELECT balance_eur INTO v_current_balance
  FROM public.workspaces
  WHERE id = p_consumer_workspace_id
  FOR UPDATE;

  -- 3. Check that the consumer has enough balance for all results
  IF v_current_balance < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'insufficient_balance',
      'balance', v_current_balance,
      'required', v_total_cost
    );
  END IF;

  -- 4. Debit the total amount in one UPDATE
  v_new_balance := v_current_balance - v_total_cost;
  UPDATE public.workspaces
  SET balance_eur = v_new_balance, updated_at = now()
  WHERE id = p_consumer_workspace_id;

  -- 5. Insert one credit_transaction per result
  -- Each transaction records the individual debit for audit trail
  FOR v_debit IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    INSERT INTO public.credit_transactions (
      consumer_workspace_id,
      publisher_workspace_id,
      type,
      amount_eur,
      content_url,
      catalog_id,
      description
    ) VALUES (
      p_consumer_workspace_id,
      (v_debit->>'publisher_workspace_id')::UUID,
      'debit',
      -((v_debit->>'price_eur')::NUMERIC),
      v_debit->>'content_url',
      (v_debit->>'catalog_id')::UUID,
      'RAG query result'
    );
  END LOOP;

  -- 6. Return success with the new balance
  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance
  );
END;
$$;


-- ============================================================================
-- ROLLBACK SQL
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.check_balance_and_debit_batch;
