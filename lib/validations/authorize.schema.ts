import { z } from "zod";

/**
 * Schema for POST /api/sdk/transaction request body.
 *
 * - urls: Array of content URLs to pre-authorize (batch).
 * - agent_id: UUID of the agent (bot) that will use the tokens.
 * - max_price_eur: Optional price ceiling per URL.
 * - ttl_minutes: Token validity duration (default 60min, max 24h).
 */
export const transactionSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(100),
  agent_id: z.string().uuid(),
  max_price_eur: z.number().min(0).max(100).optional(),
  ttl_minutes: z.number().int().min(1).max(1440).default(60),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
