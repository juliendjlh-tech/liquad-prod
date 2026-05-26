// ---------------------------------------------------------------------------
// SDK service
//
// Business logic consumed by the publisher's deployed SDK middleware.
// Only two concerns: rules sync and event ingestion.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { getWorkspaceDomains, getDomainMap } from "@/lib/db/queries/domains";
import { getWorkspaceSecret } from "@/lib/db/queries/workspaces";
import { getWorkspaceBots, getCatalogBots } from "@/lib/db/queries/agents";
import { getCatalogs } from "@/lib/db/queries/catalogs";
import type { MatchableBot, MatchableCatalog } from "@liquad/sdk/matcher";
import type { SdkEventInput } from "@/lib/validations/sdk-event.schema";
import { sdkEventSchema } from "@/lib/validations/sdk-event.schema";
import { generatePublicId } from "@/lib/ids";
import { canonicalHostnameFromUrl } from "@/lib/utils/hostname";

// ---------------------------------------------------------------------------
// Types — Gateway
// ---------------------------------------------------------------------------

export interface GatewayBot {
  id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  catalog_ids: string[];
}

export interface GatewayCatalog {
  id: string;
  name: string;
  filter_rules: {
    domain_rules: Array<{
      domain: string;
      path_rules?: Array<{ operator: string; value: string }>;
      path_logic?: "AND" | "OR";
    }>;
  };
  price_eur: number;
}

export interface GatewayRules {
  workspace_id: string;
  hmac_secret: string;
  verified_domains: string[];
  bots: GatewayBot[];
  catalogs: GatewayCatalog[];
}

// ---------------------------------------------------------------------------
// Types — Ingest
// ---------------------------------------------------------------------------

export interface IngestResult {
  accepted: number;
  rejected: number;
}

// ---------------------------------------------------------------------------
// Gateway — Rules
// ---------------------------------------------------------------------------

/**
 * Fetch and assemble the data needed for the SDK gateway:
 * bots with their catalog_ids, and free catalogs with resolved filter_rules.
 *
 * Since migration 038, catalog exposure is gated by the gateway's
 * `catalog_ids` allowlist:
 *   - Empty allowlist → no catalogs and no bots returned (the gateway lets
 *     traffic through but issues no rules).
 *   - Non-empty → fetch the intersection (gateway.catalog_ids ∩ workspace's
 *     free catalogs). Only bots linked to at least one surviving catalog are
 *     returned.
 */
async function getPublisherMatchData(
  workspaceId: string,
  gatewayCatalogIds: string[]
): Promise<{ hmacSecret: string; bots: MatchableBot[]; catalogs: MatchableCatalog[] }> {
  if (gatewayCatalogIds.length === 0) {
    const hmacSecret = await getWorkspaceSecret(workspaceId);
    return { hmacSecret, bots: [], catalogs: [] };
  }

  const [hmacSecret, bots, rawCatalogs, domainIdToHostname] =
    await Promise.all([
      getWorkspaceSecret(workspaceId),
      getWorkspaceBots(workspaceId),
      getCatalogs(gatewayCatalogIds, { workspaceId, status: "active", maxPriceEur: 0 }),
      getDomainMap(workspaceId),
    ]);

  // Build bot → catalog_ids map (sorted by price ASC)
  const catalogIds = rawCatalogs.map((c) => c.id);
  const links = await getCatalogBots(catalogIds);

  const catalogPriceMap = new Map(rawCatalogs.map((c) => [c.id, c.price_eur]));
  const botToCatalogIds = new Map<string, string[]>();

  for (const link of links) {
    const ids = botToCatalogIds.get(link.bot_id) ?? [];
    ids.push(link.catalog_id);
    botToCatalogIds.set(link.bot_id, ids);
  }

  for (const [, ids] of botToCatalogIds) {
    ids.sort(
      (a, b) => (catalogPriceMap.get(a) ?? 0) - (catalogPriceMap.get(b) ?? 0)
    );
  }

  // Free catalogs only (price_eur = 0)
  const freeCatalogs = rawCatalogs.filter((c) => c.price_eur === 0);

  // Resolve domain_id → hostname in filter_rules
  const catalogs: MatchableCatalog[] = freeCatalogs.map((catalog) => {
    const rawRules = catalog.filter_rules as unknown as {
      domain_rules: Array<{
        domain_id: string;
        path_rules?: Array<{ operator: string; value: string }>;
        path_logic?: "AND" | "OR";
      }>;
    };

    return {
      id: catalog.id,
      name: catalog.name,
      price_eur: catalog.price_eur,
      filter_rules: {
        domain_rules: (rawRules?.domain_rules ?? [])
          .map((rule) => {
            const hostname = domainIdToHostname.get(rule.domain_id);
            if (!hostname) return null;
            return {
              domain: hostname,
              ...(rule.path_rules?.length ? { path_rules: rule.path_rules } : {}),
              ...(rule.path_logic ? { path_logic: rule.path_logic } : {}),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null),
      },
    };
  });

  // Only return bots linked to at least one surviving (intersected) catalog.
  const matchableBots: MatchableBot[] = bots
    .map((a) => ({
      id: a.id,
      name: a.name,
      ua_pattern: a.ua_pattern,
      declared_ips: (a.declared_ips as string[]) ?? [],
      catalog_ids: botToCatalogIds.get(a.id) ?? [],
    }))
    .filter((b) => b.catalog_ids.length > 0);

  return { hmacSecret, bots: matchableBots, catalogs };
}

/**
 * Build the gateway rules payload for a gateway.
 * Called by the deployed SDK via GET /api/public/v1/sdk/rules.
 *
 * @param gatewayCatalogIds Catalog allowlist sourced from the authenticated
 *   gateway's `catalog_ids`. Empty array means "no catalogs exposed".
 */
export async function getGatewayRules(
  workspaceId: string,
  gatewayCatalogIds: string[]
): Promise<GatewayRules> {
  const [verifiedDomains, publisherData] = await Promise.all([
    getWorkspaceDomains(workspaceId),
    getPublisherMatchData(workspaceId, gatewayCatalogIds),
  ]);

  return {
    workspace_id: workspaceId,
    hmac_secret: publisherData.hmacSecret,
    verified_domains: verifiedDomains,
    bots: publisherData.bots,
    catalogs: publisherData.catalogs,
  };
}

// ---------------------------------------------------------------------------
// Ingest — Events
// ---------------------------------------------------------------------------

/**
 * Ingest a batch of SDK events for a workspace.
 * Called by the deployed SDK via POST /api/public/v1/sdk/events.
 */
export async function ingestEvents(
  workspaceId: string,
  events: SdkEventInput[]
): Promise<IngestResult> {
  const supabase = await createServerClient();

  if (events.length === 0) {
    return { accepted: 0, rejected: 0 };
  }

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
      source_ip: e.source_ip ?? null,
      ic_verified: e.ic_verified ?? null,
      ic_hostname: e.ic_hostname ?? null,
      ic_duration_ms: e.ic_duration_ms ?? null,
    }));

    const { error } = await supabase.from("sdk_events").insert(rows);

    if (error) {
      throw new Error(`Failed to insert events: ${error.message}`);
    }

    const canonicalHostnames = new Set<string>();
    for (const e of validEvents) {
      const host = canonicalHostnameFromUrl(e.request_url);
      if (host) canonicalHostnames.add(host);
    }

    await Promise.all(
      [...canonicalHostnames].map((host) =>
        upsertDomainAsVerified(workspaceId, host)
      )
    );
  }

  return { accepted: validEvents.length, rejected };
}

/**
 * Auto-verify a domain on first SDK event for a (workspace, hostname).
 *
 * - If the row exists and is already verified → only bump last_event_at.
 * - If the row exists in pending_verification/unverified → flip to verified.
 * - If the row doesn't exist → insert it directly as verified.
 * - If another workspace owns this hostname as verified → the partial unique
 *   index `idx_domains_verified_unique` blocks the write; we swallow the
 *   conflict silently and only bump last_event_at on the existing row (if any
 *   for this workspace).
 */
async function upsertDomainAsVerified(
  workspaceId: string,
  host: string
): Promise<void> {
  const supabase = await createServerClient();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("domains")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .eq("domain", host)
    .maybeSingle();

  if (existing) {
    if (existing.status === "verified") {
      await supabase
        .from("domains")
        .update({ last_event_at: now })
        .eq("id", existing.id);
      return;
    }

    const { error } = await supabase
      .from("domains")
      .update({ status: "verified", verified_at: now, last_event_at: now })
      .eq("id", existing.id);

    if (error && !isUniqueViolation(error)) {
      throw new Error(`Failed to verify domain: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase.from("domains").insert({
    public_id: generatePublicId("dom"),
    workspace_id: workspaceId,
    domain: host,
    status: "verified",
    verified_at: now,
    last_event_at: now,
  });

  if (error && !isUniqueViolation(error)) {
    throw new Error(`Failed to create verified domain: ${error.message}`);
  }
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}
