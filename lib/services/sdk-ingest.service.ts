// ---------------------------------------------------------------------------
// SDK Event Ingestion service
//
// Handles batch insertion of SDK events and triggers domain verification.
// Extracted from sdk.service.ts for single-responsibility.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import type { SdkEventInput } from "@/lib/validations/sdk-event.schema";
import { sdkEventSchema } from "@/lib/validations/sdk-event.schema";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestResult {
  accepted: number;
  rejected: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Ingest a batch of SDK events for a workspace.
 *
 * - Validates each event individually (partial acceptance).
 * - Batch inserts valid events into sdk_events.
 * - Updates domain.last_event_at for known domains.
 * - Triggers domain verification check for each unique domain.
 *
 * @param workspaceId - The workspace that owns these events
 * @param events - Array of raw event inputs to validate and insert
 * @returns Count of accepted and rejected events
 */
export async function ingestEvents(
  workspaceId: string,
  events: SdkEventInput[]
): Promise<IngestResult> {
  const supabase = await createServerClient();

  if (events.length === 0) {
    return { accepted: 0, rejected: 0 };
  }

  // Validate each event individually for partial acceptance
  const validEvents: SdkEventInput[] = [];
  let rejected = 0;

  for (const event of events) {
    const result = sdkEventSchema.safeParse(event);
    if (result.success) {
      validEvents.push(result.data);
    } else {
      rejected++;
    }
  }

  // Batch insert valid events
  if (validEvents.length > 0) {
    const rows = validEvents.map((e) => ({
      workspace_id: workspaceId,
      domain: e.domain,
      request_url: e.request_url,
      user_agent_name: e.user_agent_name ?? null,
      user_agent_raw: e.user_agent_raw ?? null,
      matched_catalog_id: e.matched_catalog_id ?? null,
      decision: e.decision,
      price_applied: e.price_applied ?? null,
      consumer_workspace_id: e.consumer_workspace_id ?? null,
      timestamp: e.timestamp,
      // Identity Check metadata — nullable for backward compatibility
      // with older SDKs that don't send IC data
      source_ip: e.source_ip ?? null,
      ic_verified: e.ic_verified ?? null,
      ic_hostname: e.ic_hostname ?? null,
      ic_duration_ms: e.ic_duration_ms ?? null,
    }));

    const { error } = await supabase.from("sdk_events").insert(rows);

    if (error) {
      throw new Error(`Failed to insert events: ${error.message}`);
    }

    // Update last_event_at and check verification for each unique domain
    const uniqueDomains = [...new Set(validEvents.map((e) => e.domain))];
    await Promise.all(
      uniqueDomains.map(async (domain) => {
        await supabase
          .from("domains")
          .update({ last_event_at: new Date().toISOString() })
          .eq("workspace_id", workspaceId)
          .eq("domain", domain);
      })
    );
  }

  return { accepted: validEvents.length, rejected };
}
