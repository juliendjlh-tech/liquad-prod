/**
 * Event Buffer — batches SDK events before sending to the API
 *
 * Instead of one fetch() per bot request, events are buffered and
 * flushed periodically (default 5s) or when the buffer is full (default 50).
 *
 * Compatible with edge runtimes via waitUntil for background flushing.
 */

import type { SdkEvent } from "./types";

export interface EventBufferConfig {
  apiKey: string;
  apiBaseUrl: string;
  /** Flush interval in ms (default 5000) */
  flushIntervalMs?: number;
  /** Max buffer size before forced flush (default 50) */
  maxBufferSize?: number;
  /** Error handler (events must never crash the host) */
  onError?: (error: Error) => void;
}

export function createEventBuffer(config: EventBufferConfig) {
  const buffer: SdkEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentWaitUntil: ((promise: Promise<unknown>) => void) | undefined;
  const flushInterval = config.flushIntervalMs ?? 5_000;
  const maxSize = config.maxBufferSize ?? 50;

  function flush(): void {
    if (buffer.length === 0) return;

    // Drain buffer atomically
    const batch = buffer.splice(0);

    const promise = fetch(`${config.apiBaseUrl}/api/public/v1/sdk/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events: batch }),
    }).catch((err) => {
      config.onError?.(
        err instanceof Error ? err : new Error("Event flush error")
      );
    });

    if (currentWaitUntil) currentWaitUntil(promise);
  }

  function scheduleFlush(): void {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, flushInterval);
  }

  return {
    /** Set the waitUntil function for the current request context. */
    setWaitUntil(fn: ((promise: Promise<unknown>) => void) | undefined): void {
      currentWaitUntil = fn;
    },

    /** Add an event to the buffer. Flushes automatically when full or on timer. */
    push(event: SdkEvent): void {
      buffer.push(event);
      if (buffer.length >= maxSize) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        flush();
      } else {
        scheduleFlush();
      }
    },

    /** Force flush all buffered events (e.g. on graceful shutdown). */
    flush,
  };
}
