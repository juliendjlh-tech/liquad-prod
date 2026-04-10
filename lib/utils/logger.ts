// ---------------------------------------------------------------------------
// Structured logger
//
// Thin wrapper around console.log/error that outputs structured JSON.
// Compatible with Vercel's log search and aggregation.
//
// Keeps things simple: no external dependencies, no log levels beyond
// info/warn/error. For a small team on serverless, this is sufficient.
//
// Usage:
//   log("info", "Event ingested", { workspaceId, count: 42 });
//   log("error", "Debit failed", { error: err.message });
// ---------------------------------------------------------------------------

type LogLevel = "info" | "warn" | "error";

/**
 * Emit a structured JSON log entry to stdout/stderr.
 *
 * Vercel captures stdout as structured logs when the output is JSON.
 * This function ensures a consistent shape across the codebase:
 * { level, message, timestamp, ...meta }
 *
 * @param level - Log severity: "info", "warn", or "error"
 * @param message - Human-readable description of the event
 * @param meta - Optional key-value pairs for context (workspace_id, counts, etc.)
 */
export function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  // Vercel routes stderr to error logs, stdout to info logs
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
