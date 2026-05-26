import { z } from "zod";

/**
 * Schema for POST /api/public/v1/consumer/licenses request body.
 *
 * Since migration 041 the API key carries `bot_id` (resolved server-side from
 * auth.service.authenticateConsumerKey). The request body only carries URLs.
 */
export const transactionSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(100),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
