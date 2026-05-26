import { NextRequest, NextResponse } from "next/server";
import { processScrapeMicroBatch } from "@/lib/services/pipeline.service";

/**
 * POST /api/internal/jobs/scrape-pipeline
 *
 * Internal endpoint called by the scraping pipeline to process micro-batches.
 * This endpoint is NOT session-protected (bypassed in middleware) and uses
 * a shared secret for authentication instead.
 *
 * The pipeline self-invokes this endpoint after each batch to continue
 * processing, which avoids Vercel's 10-second function timeout.
 *
 * REQUEST BODY:
 * {
 *   "import_job_id": "uuid"  // The import job to continue processing
 * }
 *
 * AUTH:
 * Authorization: Bearer <SCRAPE_PIPELINE_SECRET>
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1: Authenticate using the shared secret
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.SCRAPE_PIPELINE_SECRET;

    if (!expectedSecret) {
      console.error("SCRAPE_PIPELINE_SECRET is not configured");
      return NextResponse.json(
        { error: "Internal configuration error" },
        { status: 500 }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Step 2: Parse the request body
    const body = await request.json();
    const importJobId = body?.import_job_id;

    if (!importJobId || typeof importJobId !== "string") {
      return NextResponse.json(
        { error: "import_job_id is required" },
        { status: 400 }
      );
    }

    // Step 3: Process the next micro-batch
    // This runs synchronously within the request timeout (~10s on Hobby).
    // If there are more pages, the function self-invokes by calling this
    // same endpoint again.
    await processScrapeMicroBatch(importJobId);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Scrape pipeline error:", message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
