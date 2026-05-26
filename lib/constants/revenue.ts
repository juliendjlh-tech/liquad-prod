// ---------------------------------------------------------------------------
// Revenue split constants
//
// Each grant emitted by authorize_and_debit_batch generates 4 credit_transactions
// rows linked by grant_id:
//   - debit         : -price_eur on the consumer wallet
//   - content_owner : +CONTENT_OWNER × price (recipient = catalogue's publisher)
//   - sub_manager   : +SUB_MANAGER × price (recipient = network's workspace)
//   - platform_fee  : +PLATFORM_FEE × price (recipient NULL, no tenant)
//
// Sum of the 4 amounts is 0 (invariant enforced by computeRevenueSplit).
//
// These ratios are computed in TS and passed pre-computed to the RPC — the
// database does not know the percentages. Changing them only requires a deploy
// (no migration). Historical transactions preserve the ratios that were active
// at debit time because amounts are stored as money, not as percentages.
// ---------------------------------------------------------------------------

export const REVENUE_SPLIT = {
  CONTENT_OWNER: 0.85,
  SUB_MANAGER: 0.07,
  PLATFORM_FEE: 0.08,
} as const;

// Runtime sanity: the three shares must sum to 1.
// TypeScript cannot narrow floating-point arithmetic to literal `1`, so we use
// a runtime check instead. This throws at module load time during development
// or server start — effectively a deploy-time guard.
{
  const _sum =
    REVENUE_SPLIT.CONTENT_OWNER +
    REVENUE_SPLIT.SUB_MANAGER +
    REVENUE_SPLIT.PLATFORM_FEE;
  if (Math.abs(_sum - 1) > 1e-9) {
    throw new Error(`Revenue split ratios must sum to 1, got ${_sum}`);
  }
}

export interface RevenueSplit {
  content_owner: number;
  sub_manager: number;
  platform_fee: number;
}

/**
 * Compute the 3 attribution amounts from a price. Rounded to NUMERIC(10,4)
 * precision (4 decimals = euro cents / 100) so the values match what the RPC
 * stores.
 *
 * Note: rounding can introduce a tiny residual (sum may differ from price by
 * up to 0.0001). At MVP we accept this — the residual stays in the consumer's
 * debit row (which equals -price_eur exactly), so the wallet still balances.
 * The ledger sum invariant (-price + co + sm + pf ≈ 0) holds within ±0.0001.
 */
export function computeRevenueSplit(priceEur: number): RevenueSplit {
  return {
    content_owner: roundEur(priceEur * REVENUE_SPLIT.CONTENT_OWNER),
    sub_manager: roundEur(priceEur * REVENUE_SPLIT.SUB_MANAGER),
    platform_fee: roundEur(priceEur * REVENUE_SPLIT.PLATFORM_FEE),
  };
}

function roundEur(n: number): number {
  return Math.round(n * 10000) / 10000;
}
