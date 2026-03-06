import type { IncomingMessage, ServerResponse } from "http";

/**
 * Configuration for the Liquad SDK middleware.
 */
export interface LiquadConfig {
  /** Required: workspace API key (starts with "df_") */
  apiKey: string;

  /** Default price threshold in EUR. Default: 0 */
  defaultPrice?: number;

  /** Interval in ms to refresh rules from API. Default: 300000 (5 min) */
  refreshInterval?: number;

  /** Max events in buffer before sending batch. Default: 100 */
  batchSize?: number;

  /** Interval in ms to flush event buffer. Default: 30000 (30s) */
  batchInterval?: number;

  /** Optional error handler. Errors are never thrown to avoid crashing the host server. */
  onError?: (error: Error) => void;

  /** Liquad API base URL. Default: "https://liquad.app" */
  apiBaseUrl?: string;
}

/**
 * Express/Connect-compatible middleware signature.
 */
export type LiquadMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) => void;
