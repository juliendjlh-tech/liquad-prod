// ---------------------------------------------------------------------------
// Embedding service
//
// Responsible for:
// 1. Calling the Crawl4AI self-hosted scraper to fetch page markdown
// 2. Generating text embeddings via OpenAI text-embedding-3-small
// ---------------------------------------------------------------------------

import OpenAI from "openai";

// OpenAI embedding model — 1536 dimensions, cheap and fast.
const EMBEDDING_MODEL = "text-embedding-3-small";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single result returned by the Crawl4AI service for one URL. */
export interface Crawl4AIResult {
  url: string;
  status: "success" | "error";
  markdown?: string;
  error?: string;
}

/** Shape of the full response from the Crawl4AI /crawl endpoint. */
interface Crawl4AIResponse {
  results: Crawl4AIResult[];
}

// ---------------------------------------------------------------------------
// Crawl4AI client
// ---------------------------------------------------------------------------

/**
 * Call the Crawl4AI service to scrape a batch of URLs.
 * Returns raw markdown for each URL.
 *
 * @param urls - Array of URLs to scrape
 * @returns Array of results (one per URL, with status and markdown/error)
 */
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
    signal: AbortSignal.timeout(30_000), // 30-second timeout
  });

  if (!response.ok) {
    throw new Error(`Crawl4AI returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as Crawl4AIResponse;
  return data.results;
}

// ---------------------------------------------------------------------------
// OpenAI embeddings
// ---------------------------------------------------------------------------

/**
 * Generate embeddings for an array of text strings using OpenAI.
 *
 * Uses text-embedding-3-small (1536 dimensions).
 * Sends all texts in a single batch request for efficiency.
 *
 * @param texts - Array of text strings to embed
 * @returns Array of 1536-dimensional vectors (same order as input)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  // Sort by index to ensure the order matches the input array
  const sorted = response.data.sort((a, b) => a.index - b.index);
  return sorted.map((item) => item.embedding);
}
