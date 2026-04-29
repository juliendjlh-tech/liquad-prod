import { z } from "zod";

/**
 * Schema for POST /api/consumer/v1/licenses request body.
 *
 * - urls: Array of content URLs to pre-authorize (batch).
 * - bot_id: Optional. If provided, must match the bot bound to the API key.
 *   The effective bot identity is always derived from the key.
 * - max_price_eur: Optional price ceiling per URL.
 *
 * TTL is controlled by the publisher (catalog.ttl_minutes), not the consumer.
 */
export const transactionSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(100),
  bot_id: z.string().uuid().optional(),
  max_price_eur: z.number().min(0).max(100).optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
