import { z } from "zod";

/**
 * Schema for POST /api/consumer/authorize request body.
 *
 * - urls: Array of content URLs to pre-authorize (batch).
 * - agent_id: UUID of the agent (bot) that will use the tokens.
 * - max_price_eur: Optional price ceiling per URL.
 *
 * TTL is controlled by the publisher (catalog.ttl_minutes), not the consumer.
 */
export const transactionSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(100),
  agent_id: z.string().uuid(),
  max_price_eur: z.number().min(0).max(100).optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
