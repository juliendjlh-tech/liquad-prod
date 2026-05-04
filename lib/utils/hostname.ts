// ---------------------------------------------------------------------------
// Hostname canonicalization
//
// All writes and lookups against the `domains.domain` column must go through
// canonicalizeHostname so that variants of the same host (case, trailing dot,
// leading "www.") collapse onto a single canonical form.
// ---------------------------------------------------------------------------

/**
 * Normalize a hostname to its canonical form: lowercase, no trailing dot,
 * no leading "www.". Port is preserved. Returns the input unchanged if it's
 * empty or whitespace.
 */
export function canonicalizeHostname(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

/**
 * Extract the canonical hostname from a URL string. Returns null if parsing
 * fails (caller decides what to do — typically skip auto-verification but
 * still ingest the event).
 */
export function canonicalHostnameFromUrl(url: string): string | null {
  try {
    return canonicalizeHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}
