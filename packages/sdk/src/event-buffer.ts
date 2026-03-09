import type { LiquadConfig } from "./types";

/**
 * An SDK event to be sent to the Liquad API.
 */
export interface SdkEvent {
  domain: string;
  request_url: string;
  user_agent_name: string | null;
  user_agent_raw: string | null;
  matched_catalog_id: string | null;
  decision:
    | "granted"
    | "denied"
    | "blocked_no_catalog"
    | "authorized_paid"
    | "denied_authorization_required"
    | "denied_invalid_token";
  price_applied: number | null;
  consumer_workspace_id: string | null;
  timestamp: string; // ISO 8601
}

const MAX_BUFFER_CAPACITY = 10_000;

/**
 * Send a batch of events to the Liquad API using Node.js native https/http.
 */
function sendEvents(
  config: LiquadConfig,
  events: SdkEvent[]
): Promise<void> {
  const baseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const url = `${baseUrl}/api/sdk/events`;
  const payload = JSON.stringify({ events });

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod =
      parsedUrl.protocol === "https:" ? require("https") : require("http");

    const req = mod.request(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 10_000,
      },
      (res: import("http").IncomingMessage) => {
        // Consume response body to free resources
        res.resume();
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Event send failed with status ${res.statusCode}`));
          }
        });
      }
    );

    req.on("error", (err: Error) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Event send timed out"));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Create an event buffer instance.
 *
 * - Buffers events in memory.
 * - Flushes when batchSize is reached or batchInterval elapses.
 * - On failed sends, events remain in buffer for retry.
 * - Max capacity of 10,000 events (oldest dropped when exceeded).
 * - Best-effort final flush on stop().
 */
export function createEventBuffer(config: LiquadConfig) {
  const buffer: SdkEvent[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;
  const batchSize = config.batchSize ?? 100;
  const batchInterval = config.batchInterval ?? 30_000;
  const onError = config.onError ?? (() => {});

  async function doFlush(): Promise<void> {
    if (buffer.length === 0 || flushing) return;

    flushing = true;
    const batch = buffer.splice(0, buffer.length);

    try {
      await sendEvents(config, batch);
    } catch (err) {
      // Put events back at the front of the buffer for retry
      buffer.unshift(...batch);
      onError(
        err instanceof Error ? err : new Error("Unknown error sending events")
      );
    } finally {
      flushing = false;
    }
  }

  return {
    start(): void {
      timer = setInterval(() => {
        void doFlush();
      }, batchInterval);
    },

    add(event: SdkEvent): void {
      if (buffer.length >= MAX_BUFFER_CAPACITY) {
        buffer.shift(); // Drop oldest event
        onError(
          new Error(
            `Event buffer at max capacity (${MAX_BUFFER_CAPACITY}). Oldest event dropped.`
          )
        );
      }

      buffer.push(event);

      if (buffer.length >= batchSize) {
        void doFlush();
      }
    },

    async flush(): Promise<void> {
      await doFlush();
    },

    async stop(): Promise<void> {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      // Best-effort final flush
      await doFlush();
    },

    size(): number {
      return buffer.length;
    },
  };
}
