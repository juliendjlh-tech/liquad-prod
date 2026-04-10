// ---------------------------------------------------------------------------
// RAG Query Pipeline — Runner
//
// Executes an ordered array of PipelineStep functions against a shared
// context. Each step either mutates the context (continue) or returns
// a QueryResult (short-circuit).
//
// This is intentionally simple — no middleware framework, no dependency
// injection, just typed functions composed in a linear sequence.
// ---------------------------------------------------------------------------

import type { RagQueryContext, PipelineStep, QueryResult } from "./types";

/**
 * Run the pipeline steps sequentially against the shared context.
 *
 * Each step is called in order. If a step returns a QueryResult
 * (error, dry-run, or early success), the pipeline stops immediately
 * and returns that result. If all steps complete without returning,
 * the pipeline returns the finalResult from the context.
 *
 * @param ctx - The mutable pipeline context
 * @param steps - Ordered array of step functions
 * @returns The first QueryResult returned by any step, or finalResult from context
 */
export async function runPipeline(
  ctx: RagQueryContext,
  steps: PipelineStep[]
): Promise<QueryResult> {
  for (const step of steps) {
    const result = await step(ctx);
    if (result !== undefined) {
      return result;
    }
  }

  // If the last step set finalResult on the context, return it
  if (ctx.finalResult) {
    return ctx.finalResult;
  }

  // Should not reach here — the last step should always return a result
  return { error: "pipeline_incomplete", status: 500 };
}
