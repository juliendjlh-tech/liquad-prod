// ---------------------------------------------------------------------------
// Pipeline service
//
// Consolidated from:
//   - scrape-pipeline.service.ts (orchestration)
//   - chunking.service.ts (markdown splitting)
//   - embedding.service.ts (Crawl4AI + OpenAI embeddings)
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import { createServerClient } from "@/lib/db/supabase-server";
import { matchContentAgainstRules } from "@/lib/validations/catalog.schema";
import type { FilterRules } from "@/lib/validations/catalog.schema";
import { getDomainMap } from "@/lib/db/queries/domains";
import { getAllSourcesWithDomain } from "@/lib/db/queries/sources";
import { getCatalogSources } from "@/lib/db/queries/catalogs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MICRO_BATCH_SIZE = 10;
const MAX_RETRIES_PER_URL = 1;
const EMBEDDING_MODEL = "text-embedding-3-small";
const TARGET_TOKENS = 600;
const OVERLAP_TOKENS = 100;

// ---------------------------------------------------------------------------
// Types — Chunking
// ---------------------------------------------------------------------------

export interface MarkdownChunk {
  text: string;
  headingContext: string;
  tokenCount: number;
}

interface MarkdownSection {
  headingContext: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Types — Embedding
// ---------------------------------------------------------------------------

export interface Crawl4AIResult {
  url: string;
  status: "success" | "error";
  markdown?: string;
  error?: string;
}

interface Crawl4AIResponse {
  results: Crawl4AIResult[];
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export function estimateTokenCount(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

export function sanitizeChunk(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "").trim();
}

export function chunkMarkdown(
  markdown: string,
  targetTokens: number = TARGET_TOKENS,
  overlapTokens: number = OVERLAP_TOKENS
): MarkdownChunk[] {
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  const chunks: MarkdownChunk[] = [];
  const sections = splitByHeadings(markdown);

  for (const section of sections) {
    const sectionTokens = estimateTokenCount(section.body);

    if (sectionTokens <= targetTokens) {
      const text = sanitizeChunk(section.body);
      if (text.length > 0) {
        chunks.push({
          text,
          headingContext: section.headingContext,
          tokenCount: estimateTokenCount(text),
        });
      }
    } else {
      const subChunks = splitByParagraphs(
        section.body,
        section.headingContext,
        targetTokens,
        overlapTokens
      );
      chunks.push(...subChunks);
    }
  }

  return chunks;
}

function splitByHeadings(markdown: string): MarkdownSection[] {
  const lines = markdown.split("\n");
  const sections: MarkdownSection[] = [];
  const headingStack: string[] = new Array(7).fill("");
  let currentBody = "";
  let currentContext = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch) {
      if (currentBody.trim().length > 0) {
        sections.push({ headingContext: currentContext, body: currentBody.trim() });
      }

      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      headingStack[level] = headingText;

      for (let i = level + 1; i <= 6; i++) {
        headingStack[i] = "";
      }

      currentContext = headingStack.filter(Boolean).join(" > ");
      currentBody = line + "\n";
    } else {
      currentBody += line + "\n";
    }
  }

  if (currentBody.trim().length > 0) {
    sections.push({ headingContext: currentContext, body: currentBody.trim() });
  }

  return sections;
}

function splitByParagraphs(
  text: string,
  headingContext: string,
  targetTokens: number,
  overlapTokens: number
): MarkdownChunk[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: MarkdownChunk[] = [];

  let currentChunkParagraphs: string[] = [];
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokenCount(paragraph);

    if (currentTokens + paragraphTokens > targetTokens && currentChunkParagraphs.length > 0) {
      const chunkText = sanitizeChunk(currentChunkParagraphs.join("\n\n"));
      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          headingContext,
          tokenCount: estimateTokenCount(chunkText),
        });
      }

      const overlapParagraphs: string[] = [];
      let overlapCount = 0;
      for (let i = currentChunkParagraphs.length - 1; i >= 0; i--) {
        const pTokens = estimateTokenCount(currentChunkParagraphs[i]);
        if (overlapCount + pTokens > overlapTokens) break;
        overlapParagraphs.unshift(currentChunkParagraphs[i]);
        overlapCount += pTokens;
      }

      currentChunkParagraphs = overlapParagraphs;
      currentTokens = overlapCount;
    }

    currentChunkParagraphs.push(paragraph);
    currentTokens += paragraphTokens;
  }

  if (currentChunkParagraphs.length > 0) {
    const chunkText = sanitizeChunk(currentChunkParagraphs.join("\n\n"));
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        headingContext,
        tokenCount: estimateTokenCount(chunkText),
      });
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embedding — Crawl4AI
// ---------------------------------------------------------------------------

export async function callCrawl4AI(urls: string[]): Promise<Crawl4AIResult[]> {
  const crawl4aiUrl = process.env.CRAWL4AI_URL;
  if (!crawl4aiUrl) {
    throw new Error("CRAWL4AI_URL environment variable is not set");
  }

  const response = await fetch(`${crawl4aiUrl}/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      urls,
      user_agent: "LiquadBot/1.0",
      max_chars_per_page: 50000,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Crawl4AI returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as Crawl4AIResponse;
  return data.results;
}

// ---------------------------------------------------------------------------
// Embedding — OpenAI
// ---------------------------------------------------------------------------

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  const sorted = response.data.sort((a, b) => a.index - b.index);
  return sorted.map((item) => item.embedding);
}

// ---------------------------------------------------------------------------
// Catalog ↔ Source Linking
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

/**
 * Incrementally link newly indexed sources to RAG-enabled catalogs.
 * INSERT-ONLY — never deletes existing links.
 */
export async function linkNewSources(
  workspaceId: string,
  sourceIds: string[]
): Promise<void> {
  if (sourceIds.length === 0) return;

  const supabase = await createServerClient();

  const { data: catalogs, error: catErr } = await supabase
    .from("catalogs")
    .select("id, filter_rules, workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("rag_enabled", true);

  if (catErr || !catalogs || catalogs.length === 0) return;

  const domainMap = await getDomainMap(workspaceId);
  if (domainMap.size === 0) return;

  const sources: Array<{ id: string; source_url: string; domain_id: string }> = [];

  for (let i = 0; i < sourceIds.length; i += PAGE_SIZE) {
    const batch = sourceIds.slice(i, i + PAGE_SIZE);
    const { data } = await supabase
      .from("sources")
      .select("id, source_url, domain_id")
      .in("id", batch);

    if (data) sources.push(...data);
  }

  if (sources.length === 0) return;

  const BATCH = 1000;

  for (const catalog of catalogs) {
    const filterRules = catalog.filter_rules as unknown as FilterRules;

    const matchedIds: string[] = [];
    for (const source of sources) {
      const hostname = domainMap.get(source.domain_id);
      if (!hostname) continue;
      try {
        const pathname = new URL(source.source_url).pathname;
        if (matchContentAgainstRules(hostname, pathname, filterRules, domainMap)) {
          matchedIds.push(source.id);
        }
      } catch {
        // Skip invalid URLs
      }
    }

    for (let i = 0; i < matchedIds.length; i += BATCH) {
      const batch = matchedIds.slice(i, i + BATCH).map((sourceId) => ({
        catalog_id: catalog.id,
        source_id: sourceId,
      }));
      await supabase
        .from("catalog_sources")
        .upsert(batch, { onConflict: "catalog_id,source_id" });
    }

    if (matchedIds.length > 0) {
      const { count } = await supabase
        .from("catalog_sources")
        .select("*", { count: "exact", head: true })
        .eq("catalog_id", catalog.id);

      await supabase
        .from("catalogs")
        .update({ rag_source_count: count ?? 0 })
        .eq("id", catalog.id);
    }
  }
}

/**
 * Full sync: diff-based linking of ALL workspace sources to catalogs.
 */
export async function syncCatalogSources(
  workspaceId: string,
  catalogId?: string
): Promise<void> {
  const supabase = await createServerClient();

  let catalogQuery = supabase
    .from("catalogs")
    .select("id, filter_rules, workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("rag_enabled", true);

  if (catalogId) {
    catalogQuery = catalogQuery.eq("id", catalogId);
  }

  const { data: catalogs, error: catErr } = await catalogQuery;
  if (catErr || !catalogs || catalogs.length === 0) return;

  const domainMap = await getDomainMap(workspaceId);
  if (domainMap.size === 0) return;

  const allSources = await getAllSourcesWithDomain(workspaceId);

  for (const catalog of catalogs) {
    const filterRules = catalog.filter_rules as unknown as FilterRules;

    const expectedIds = new Set<string>();
    for (const source of allSources) {
      const hostname = domainMap.get(source.domain_id);
      if (!hostname) continue;
      try {
        const pathname = new URL(source.source_url).pathname;
        if (matchContentAgainstRules(hostname, pathname, filterRules, domainMap)) {
          expectedIds.add(source.id);
        }
      } catch {
        // Skip invalid URLs
      }
    }

    const existingLinks = await getCatalogSources([catalog.id]);
    const existingIds = new Set<string>(existingLinks.map((l) => l.source_id));

    const toInsert: string[] = [];
    for (const id of expectedIds) {
      if (!existingIds.has(id)) toInsert.push(id);
    }

    const toDelete: string[] = [];
    for (const id of existingIds) {
      if (!expectedIds.has(id)) toDelete.push(id);
    }

    if (toDelete.length > 0 && toDelete.length > toInsert.length * 2 && existingIds.size > 100) {
      console.warn(
        `[syncCatalogSources] catalog ${catalog.id}: deleting ${toDelete.length} vs inserting ${toInsert.length} — possible filter_rules issue`
      );
    }

    const BATCH = 1000;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH);
      await supabase
        .from("catalog_sources")
        .delete()
        .eq("catalog_id", catalog.id)
        .in("source_id", batch);
    }

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH).map((sourceId) => ({
        catalog_id: catalog.id,
        source_id: sourceId,
      }));
      await supabase
        .from("catalog_sources")
        .upsert(batch, { onConflict: "catalog_id,source_id" });
    }

    await supabase
      .from("catalogs")
      .update({ rag_source_count: expectedIds.size })
      .eq("id", catalog.id);
  }
}

// ---------------------------------------------------------------------------
// Scrape Pipeline — Helpers
// ---------------------------------------------------------------------------

async function getPendingUrls(
  importJobId: string,
  urlsToIndex: string[]
): Promise<string[]> {
  if (urlsToIndex.length === 0) return [];

  const supabase = await createServerClient();

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

  return urlsToIndex.filter((url) => !indexedUrls.has(url));
}

// ---------------------------------------------------------------------------
// Scrape Pipeline — Start
// ---------------------------------------------------------------------------

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
// Scrape Pipeline — Micro-batch
// ---------------------------------------------------------------------------

export async function processScrapeMicroBatch(importJobId: string): Promise<void> {
  const supabase = await createServerClient();

  const { data: job } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", importJobId)
    .single();

  if (!job) return;

  if (job.scrape_status !== "scraping") {
    await supabase
      .from("import_jobs")
      .update({ scrape_status: "scraping", updated_at: new Date().toISOString() })
      .eq("id", importJobId);
  }

  const urlsToIndex: string[] = job.urls_to_index ?? [];

  const pendingUrls = await getPendingUrls(importJobId, urlsToIndex);

  if (pendingUrls.length === 0) {
    await finalizeScrapePipeline(importJobId, job.workspace_id);
    return;
  }

  const batchUrls = pendingUrls.slice(0, MICRO_BATCH_SIZE);

  const retryCounts = new Map<string, number>();

  try {
    const crawlResults = await callCrawl4AI(batchUrls);

    for (const result of crawlResults) {
      const originalUrl = batchUrls.find((url) => url === result.url);
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

      const chunks = chunkMarkdown(result.markdown);
      if (chunks.length === 0) {
        continue;
      }

      const embeddings = await generateEmbeddings(chunks.map((c) => c.text));

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

      await supabase
        .from("chunks")
        .delete()
        .eq("source_id", source.id);

      const chunkRows = chunks.map((chunk, index) => ({
        source_id: source.id,
        import_job_id: importJobId,
        chunk_index: index,
        chunk_text: chunk.text,
        heading_context: chunk.headingContext,
        token_count: chunk.tokenCount,
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

  const remainingUrls = await getPendingUrls(importJobId, urlsToIndex);

  if (remainingUrls.length > 0) {
    await triggerScrapePipeline(importJobId);
  } else {
    await finalizeScrapePipeline(importJobId, job.workspace_id);
  }
}

// ---------------------------------------------------------------------------
// Scrape Pipeline — Finalization
// ---------------------------------------------------------------------------

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
