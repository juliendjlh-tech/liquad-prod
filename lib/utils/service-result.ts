// ---------------------------------------------------------------------------
// ServiceResult — Typed error/success pattern
//
// Provides a consistent, type-safe way to return errors from service
// functions without throwing exceptions. This replaces the ad-hoc
// union types (e.g., { error: string; status: number }) used across
// sdk-auth, authorize, and rag-query services.
//
// Usage:
//   return ok(data);          // { ok: true, data }
//   return err("NOT_FOUND", 404);  // { ok: false, error, status }
// ---------------------------------------------------------------------------

/**
 * Discriminated union for service function returns.
 *
 * - ok: true  → data is present (typed as T)
 * - ok: false → error string + HTTP status code + optional details
 *
 * This avoids the "error in result" pattern that requires type guards
 * and makes it easy to map to HTTP responses in API routes.
 */
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; details?: Record<string, unknown> };

/**
 * Create a successful ServiceResult wrapping the given data.
 *
 * @param data - The result payload
 * @returns A success result: { ok: true, data }
 */
export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

/**
 * Create a failed ServiceResult with an error code and HTTP status.
 *
 * @param error - Machine-readable error code (e.g., "NOT_FOUND", "FORBIDDEN")
 * @param status - HTTP status code to use in the API response
 * @param details - Optional extra context for debugging
 * @returns A failure result: { ok: false, error, status, details? }
 */
export function err(
  error: string,
  status: number,
  details?: Record<string, unknown>
): ServiceResult<never> {
  return { ok: false, error, status, details };
}
