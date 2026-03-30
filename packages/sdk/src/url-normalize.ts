/**
 * Normalize a URL for deduplication and matching.
 *
 * Rules:
 * - Scheme + hostname lowercased (automatic via URL constructor)
 * - Keep pathname (case-sensitive)
 * - Strip query string
 * - Strip fragment (#hash)
 * - Strip trailing slash (except for root "/")
 *
 * @param rawUrl - The raw URL string to normalize
 * @returns Normalized URL string or null if invalid
 */
export function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);

    let path = url.pathname;

    // Strip trailing slash unless root path
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    // Reconstruct: protocol + host (lowercased) + path (no query/fragment)
    return `${url.protocol}//${url.hostname}${path}`;
  } catch {
    return null;
  }
}
