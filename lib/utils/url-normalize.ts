/**
 * Normalize a URL for deduplication.
 *
 * Rules:
 * - Scheme + hostname lowercased (automatic via URL constructor)
 * - Keep pathname (case-sensitive)
 * - Strip query string
 * - Strip fragment (#hash)
 * - Strip trailing slash (except for root "/")
 *
 * @param rawUrl - The raw URL string to normalize
 * @returns Normalized URL string: scheme + host + path
 *
 * @example
 * normalizeUrl("HTTPS://Example.COM/Article/?ref=1#top")
 * // → "https://example.com/article"
 */
export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);

  // pathname is already lowercased for hostname via URL constructor
  let path = url.pathname;

  // Strip trailing slash unless root path
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  // Reconstruct: protocol + host (lowercased) + path (no query/fragment)
  return `${url.protocol}//${url.hostname}${path}`;
}
