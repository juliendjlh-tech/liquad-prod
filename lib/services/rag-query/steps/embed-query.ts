// ---------------------------------------------------------------------------
// Step 6: Generate embedding for the query text
// ---------------------------------------------------------------------------

import { generateEmbeddings } from "@/lib/services/embedding.service";
import type { PipelineStep } from "../types";

/**
 * Generate a vector embedding for the consumer's query text
 * using the OpenAI embeddings API.
 *
 * Sets ctx.queryEmbedding on success.
 */
export const embedQuery: PipelineStep = async (ctx) => {
  try {
    const embeddings = await generateEmbeddings([ctx.input.query]);
    ctx.queryEmbedding = embeddings[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Embedding failed";
    return { error: "embedding_error", status: 500, details: { message } };
  }
};
