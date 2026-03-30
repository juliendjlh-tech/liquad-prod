// ---------------------------------------------------------------------------
// Scrape pipeline service — orchestration only
//
// This service manages the end-to-end pipeline for indexing a domain:
//   1. startScrapePipeline()     — initialize the pipeline for an import job
//   2. processScrapeMicroBatch() — process MICRO_BATCH_SIZE pages per invocation
//   3. finalizeScrapePipeline()  — mark the job done and link catalogs
//   4. triggerScrapePipeline()   — self-invoke the internal endpoint (next batch)
//
// Progress tracking:
//   - urls_to_index TEXT[] on import_jobs is immutable (written at job creation)
//   - Diff against sources that have chunks with embeddings
//
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { chunkMarkdown } from "@/lib/services/chunking.service";
import { callCrawl4AI, generateEmbeddings } from "@/lib/services/embedding.service";
import { linkNewSources } from "@/lib/services/catalog-linking.service";

// Number of pages to process in each micro-batch.
// Kept small to fit within Vercel Hobby's 10-second function timeout.
const MICRO_BATCH_SIZE = 10;

// Max retry attempts per URL before giving up (tracked in-memory per invocation chain)
const MAX_RETRIES_PER_URL = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch URLs from urls_to_index that don't yet have chunks with embeddings.
 * Joins sources → chunks to find which URLs have been successfully indexed.
 *
 * @returns Array of URLs still pending scraping
 */
async function getPendingUrls(
  importJobId: string,
  urlsToIndex: string[],
  workspaceId: string
): Promise<string[]> {
  if (urlsToIndex.length === 0) return [];

  const supabase = await createServerClient();

  // Fetch all source_urls that have at least one chunk with an embedding
  // linked to this import job.
  const PAGE_SIZE = 1000;
  const indexedUrls = new Set<string>();
  let from = 0;

  while (true) {
    const { data } = await supabase
      .from("chunks")
      .select("source_id, sources!inner(source_url)")
      .eq("import_job_id", importJobId)
      .not("embedding", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (!data || data.length === 0) break;
    for (const row of data) {
      const sourceUrl = (row.sources as unknown as { source_url: string })?.source_url;
      if (sourceUrl) indexedUrls.add(sourceUrl);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Diff: urls_to_index − indexed urls
  return urlsToIndex.filter((url) => !indexedUrls.has(url));
}

// ---------------------------------------------------------------------------
// Pipeline — start
// ---------------------------------------------------------------------------

/**
 * Initialize the scraping pipeline for an import job.
 *
 * Reads urls_to_index from the job, counts pending URLs, and kicks off
 * the first micro-batch via the internal endpoint.
 *
 * @param importJobId - The ID of the import_job to process
 */
export async function startScrapePipeline(importJobId: string): Promise<void> {
  const supabase = await createServerClient();

  const { data: job } = await supabase
    .from("import_jobs")
    .select("id, workspace_id, domain_id, urls_to_index")
    .eq("id", importJobId)
    .single();

  if (!job) return;

  const urlsToIndex: string[] = job.urls_to_index ?? [];
  const totalPages = urlsToIndex.length;

  if (totalPages === 0) {
    await supabase
      .from("import_jobs")
      .update({
        scrape_status: "scraped",
        updated_at: new Date().toISOString(),
      })
      .eq("id", importJobId);
    return;
  }

  await supabase
    .from("import_jobs")
    .update({
      scrape_status: "pending",
      scrape_processed_pages: 0,
      scrape_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", importJobId);

  await triggerScrapePipeline(importJobId);
}

// ---------------------------------------------------------------------------
// Pipeline — micro-batch
// ---------------------------------------------------------------------------

/**
 * Process a single micro-batch of pages for an import job.
 *
 * This is the core loop called once per Vercel invocation:
 * 1. Compute pending URLs via diff (urls_to_index − indexed)
 * 2. Take the next MICRO_BATCH_SIZE URLs
 * 3. Send URLs to Crawl4AI
 * 4. Chunk the returned markdown (chunking.service)
 * 5. Generate embeddings via OpenAI (embedding.service)
 * 6. Find source_id for each URL, delete old chunks, insert new chunks
 * 7. If more pages remain → self-invoke to continue
 * 8. If done → finalize (update job status + link catalogs)
 *
 * @param importJobId - The ID of the import_job being processed
 */
export async function processScrapeMicroBatch(importJobId: string): Promise<void> {
  const supabase = await createServerClient();

  const { data: job } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", importJobId)
    .single();

  if (!job) return;

  // Mark as 'scraping' on first batch
  if (job.scrape_status !== "scraping") {
    await supabase
      .from("import_jobs")
      .update({ scrape_status: "scraping", updated_at: new Date().toISOString() })
      .eq("id", importJobId);
  }

  const urlsToIndex: string[] = job.urls_to_index ?? [];

  // Compute pending URLs via diff
  const pendingUrls = await getPendingUrls(importJobId, urlsToIndex, job.workspace_id);

  if (pendingUrls.length === 0) {
    await finalizeScrapePipeline(importJobId, job.workspace_id);
    return;
  }

  // Take the next batch
  const batchUrls = pendingUrls.slice(0, MICRO_BATCH_SIZE);

  // In-memory retry tracking for this batch
  const retryCounts = new Map<string, number>();

  try {
    // Step 1: Scrape all URLs in the batch
    const crawlResults = await callCrawl4AI(batchUrls);

    // Step 2: Process each crawl result
    for (const result of crawlResults) {
      // Use the original URL from urls_to_index, not the crawler's URL
      const originalUrl = batchUrls.find(
        (url) => url === result.url
      );
      if (!originalUrl) continue;

      if (result.status === "error" || !result.markdown) {
        const retries = retryCounts.get(originalUrl) ?? 0;
        retryCounts.set(originalUrl, retries + 1);

        if (retries + 1 >= MAX_RETRIES_PER_URL) {
          console.warn(
            `[scrape-pipeline] Giving up on ${originalUrl} after ${MAX_RETRIES_PER_URL} retries`
          );
        }
        continue;
      }

      // Step 3: Chunk the markdown
      const chunks = chunkMarkdown(result.markdown);
      if (chunks.length === 0) {
        continue;
      }

      // Step 4: Embed all chunks of this page in one batch call
      const embeddings = await generateEmbeddings(chunks.map((c) => c.text));

      // Step 5: Find the source_id for this URL
      const { data: source } = await supabase
        .from("sources")
        .select("id")
        .eq("workspace_id", job.workspace_id)
        .eq("source_url", originalUrl)
        .single();

      if (!source) {
        console.error(`[scrape-pipeline] Source not found for URL: ${originalUrl}`);
        continue;
      }

      // Step 6: Delete old chunks for this source (clean up stale data).
      // catalog_sources links are NOT affected (they point to source, not chunks).
      await supabase
        .from("chunks")
        .delete()
        .eq("source_id", source.id);

      // Step 7: Insert chunk rows with source_id
      const chunkRows = chunks.map((chunk, index) => ({
        source_id: source.id,
        import_job_id: importJobId,
        chunk_index: index,
        chunk_text: chunk.text,
        heading_context: chunk.headingContext,
        token_count: chunk.tokenCount,
        // pgvector expects a string like "[0.1, 0.2, ...]"
        embedding: `[${embeddings[index].join(",")}]`,
      }));

      const { error: insertErr } = await supabase.from("chunks").insert(chunkRows);

      if (insertErr) {
        console.error(`Failed to insert chunks for ${originalUrl}:`, insertErr.message);
        continue;
      }

    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Scrape micro-batch error for job ${importJobId}:`, message);
  }

  // Re-check pending URLs to decide whether to continue
  const remainingUrls = await getPendingUrls(importJobId, urlsToIndex, job.workspace_id);

  if (remainingUrls.length > 0) {
    await triggerScrapePipeline(importJobId);
  } else {
    await finalizeScrapePipeline(importJobId, job.workspace_id);
  }
}

// ---------------------------------------------------------------------------
// Pipeline — finalization
// ---------------------------------------------------------------------------

/**
 * Finalize the pipeline: set job status and link RAG catalogs.
 *
 * Marks the job as 'scraped' (or 'error' if >50% of pages failed),
 * then incrementally links the domain's sources to matching catalogs.
 *
 * @param importJobId - The import job being finalized
 * @param workspaceId - The workspace to link catalogs for
 */
async function finalizeScrapePipeline(
  importJobId: string,
  workspaceId: string
): Promise<void> {
  const supabase = await createServerClient();

  const { data: job } = await supabase
    .from("import_jobs")
    .select("domain_id, urls_to_index")
    .eq("id", importJobId)
    .single();

  if (!job) return;

  const urlsToIndex: string[] = job.urls_to_index ?? [];
  const totalPages = urlsToIndex.length;

  // Count URLs that successfully produced chunks with embeddings
  const indexedUrls = new Set<string>();
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const { data } = await supabase
      .from("chunks")
      .select("source_id, sources!inner(source_url)")
      .eq("import_job_id", importJobId)
      .not("embedding", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (!data || data.length === 0) break;
    for (const row of data) {
      const sourceUrl = (row.sources as unknown as { source_url: string })?.source_url;
      if (sourceUrl) indexedUrls.add(sourceUrl);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const successCount = indexedUrls.size;
  const failedCount = totalPages - successCount;
  const errorRate = totalPages > 0 ? failedCount / totalPages : 0;

  if (errorRate > 0.5) {
    await supabase
      .from("import_jobs")
      .update({
        scrape_status: "error",
        scrape_error_message: `${failedCount}/${totalPages} pages failed to scrape (${Math.round(errorRate * 100)}% error rate)`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", importJobId);
  } else {
    const warningMessage = failedCount > 0
      ? `${failedCount}/${totalPages} pages failed to scrape`
      : null;

    await supabase
      .from("import_jobs")
      .update({
        scrape_status: "scraped",
        scrape_error_message: warningMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", importJobId);
  }

  // Link sources that were indexed to matching catalogs
  // Fetch source_ids for all successfully indexed URLs in this job
  const sourceIds: string[] = [];
  from = 0;

  while (true) {
    const { data: batch } = await supabase
      .from("sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("source_url", urlsToIndex)
      .range(from, from + PAGE_SIZE - 1);

    if (!batch || batch.length === 0) break;
    sourceIds.push(...batch.map((s) => s.id));
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (sourceIds.length > 0) {
    await linkNewSources(workspaceId, sourceIds);
  }
}

// ---------------------------------------------------------------------------
// Self-invocation helper
// ---------------------------------------------------------------------------

/**
 * Trigger the next micro-batch by POSTing to the internal scrape-pipeline endpoint.
 *
 * Each call creates a fresh Vercel invocation, avoiding the 10s timeout.
 *
 * @param importJobId - The import job to continue processing
 */
async function triggerScrapePipeline(importJobId: string): Promise<void> {
  const secret = process.env.SCRAPE_PIPELINE_SECRET;
  if (!secret) {
    throw new Error("SCRAPE_PIPELINE_SECRET environment variable is not set");
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  await fetch(`${baseUrl}/api/internal/scrape-pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ import_job_id: importJobId }),
  });
}
