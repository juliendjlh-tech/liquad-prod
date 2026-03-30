// ---------------------------------------------------------------------------
// Chunking service
//
// Responsible for splitting scraped markdown into smaller chunks suitable
// for embedding and vector search.
//
// A "chunk" is a piece of text with:
// - a token count (approximated)
// - a heading context (the heading hierarchy at the point of the chunk)
//
// Chunking strategy:
// 1. Split by headings (# to ######) to preserve semantic sections
// 2. If a section exceeds TARGET_TOKENS, split further by paragraphs
// 3. Apply overlap between consecutive chunks for context continuity
// ---------------------------------------------------------------------------

// Target number of tokens per chunk (roughly 500-800 words).
const TARGET_TOKENS = 600;

// Number of tokens to overlap between consecutive chunks.
// Ensures context is not lost at chunk boundaries.
const OVERLAP_TOKENS = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single chunk produced by chunkMarkdown(). */
export interface MarkdownChunk {
  text: string;
  headingContext: string; // e.g. "Billing > Payments"
  tokenCount: number;
}

/** A section extracted from a markdown document. */
interface MarkdownSection {
  headingContext: string; // e.g. "Introduction > Getting Started"
  body: string; // Text content (including the heading line itself)
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the token count for a piece of text.
 *
 * Uses a simple heuristic: ~1.3 tokens per whitespace-delimited word.
 * This is accurate enough for chunking decisions (not billing).
 *
 * @param text - The text to estimate tokens for
 * @returns Approximate token count
 */
export function estimateTokenCount(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

// ---------------------------------------------------------------------------
// Chunk sanitization
// ---------------------------------------------------------------------------

/**
 * Remove Unicode control characters and excessive whitespace from a chunk.
 * Keeps normal text, newlines, and tabs intact.
 *
 * @param text - Raw text to sanitize
 * @returns Cleaned text
 */
export function sanitizeChunk(text: string): string {
  // Remove Unicode control chars (C0 and C1) except \n, \r, \t
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "").trim();
}

// ---------------------------------------------------------------------------
// Markdown chunking
// ---------------------------------------------------------------------------

/**
 * Split a markdown document into chunks suitable for embedding.
 *
 * Strategy:
 * 1. Split by headings (# to ######) to preserve semantic sections.
 * 2. If a section exceeds targetTokens, split further by paragraphs.
 * 3. Apply overlap between consecutive chunks for context continuity.
 *
 * @param markdown - The full markdown text of a page
 * @param targetTokens - Target token count per chunk (default 600)
 * @param overlapTokens - Overlap between chunks (default 100)
 * @returns Array of chunks with text, heading context, and token count
 */
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
      // Section fits in one chunk — add it directly
      const text = sanitizeChunk(section.body);
      if (text.length > 0) {
        chunks.push({
          text,
          headingContext: section.headingContext,
          tokenCount: estimateTokenCount(text),
        });
      }
    } else {
      // Section is too large — split by paragraphs with overlap
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split markdown into sections based on heading markers (# to ######).
 * Tracks the heading hierarchy to build a breadcrumb-like context string.
 *
 * @param markdown - Full markdown text
 * @returns Array of sections with heading context and body text
 */
function splitByHeadings(markdown: string): MarkdownSection[] {
  const lines = markdown.split("\n");
  const sections: MarkdownSection[] = [];

  // Track the current heading at each level (1-6).
  // Example: headingStack[2] = "Getting Started" means the last h2 was "Getting Started"
  const headingStack: string[] = new Array(7).fill("");
  let currentBody = "";
  let currentContext = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch) {
      // Save the previous section (if it has content)
      if (currentBody.trim().length > 0) {
        sections.push({ headingContext: currentContext, body: currentBody.trim() });
      }

      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      headingStack[level] = headingText;

      // Clear all deeper levels (e.g. if we see h2, clear h3-h6)
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

/**
 * Split a large section into smaller chunks by paragraphs with overlap.
 *
 * @param text - The section text to split
 * @param headingContext - The heading context for all chunks in this section
 * @param targetTokens - Target chunk size in tokens
 * @param overlapTokens - Number of overlap tokens between chunks
 * @returns Array of chunks
 */
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

      // Apply overlap: keep the last paragraph(s) that fit within overlapTokens
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

  // Finalize the last chunk
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
