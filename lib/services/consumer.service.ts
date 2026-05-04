// ---------------------------------------------------------------------------
// Consumer service
//
// Business logic for the consumer API (crawler operators).
// Handles content authorization (pre-purchase of signed tokens) and
// discovery of accessible indexed sources.
//
// Design:
//   - Indexed source-based matching: only indexed URLs can be purchased
//   - ua_pattern reconciliation: consumer bot matched to publisher catalogs
//     via ua_pattern (not strict bot_id), so preset and operator bots unify
//   - Bot-bound tokens: ua_pattern encoded in HMAC signature, gateway verifies
//   - Publisher-controlled TTL: catalog.ttl_minutes, not consumer-provided
//   - declared_ips required: bots without IP ranges cannot participate
//   - Per-subscription scope: bot_subscriptions.scope_to_workspace=true
//     (default) restricts visible catalogs to the workspace owning the
//     subscription. Network access is an explicit per-subscription opt-in
//     (Option F, see migration 031).
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { resolvePublisherDomains } from "@/lib/db/queries/domains";
import { getWorkspaceSecret } from "@/lib/db/queries/workspaces";
import { findSourcesByUrls } from "@/lib/db/queries/sources";
import {
  getCatalogIdsBySourceIds,
  getCatalogs,
  getCatalogSources,
  type CatalogRecord,
} from "@/lib/db/queries/catalogs";
import {
  getBotById,
  getCatalogBots,
  isBotActiveForWorkspace,
  type BotRecord,
} from "@/lib/db/queries/agents";
import { normalizeUrl } from "@liquad/sdk/url-normalize";
import { ok, err, type ServiceResult } from "@/lib/utils/service-result";
import { canonicalizeHostname } from "@/lib/utils/hostname";
import type { TransactionInput } from "@/lib/validations/authorize.schema";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MINUTES = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthorizeUrlResult {
  url: string;
  token: string;
  price_eur: number;
  catalog_id: string;
  expires_at: string;
  cached: boolean;
  allowed_ips: string[];
}

interface UnmatchedUrl {
  url: string;
  reason: "no_match" | "no_catalog" | "no_matching_ips";
}

export interface AuthorizeSuccess {
  results: AuthorizeUrlResult[];
  unmatched: UnmatchedUrl[];
  total_cost_eur: number;
  balance_remaining_eur: number;
}

// ---------------------------------------------------------------------------
// HMAC helpers — key imported once per publisher, reused for all URLs
// ---------------------------------------------------------------------------

async function importHmacKey(base64Secret: string): Promise<CryptoKey> {
  const keyData = Buffer.from(base64Secret, "base64");
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/**
 * Sign an HMAC token with bot identity (ua_pattern) bound in the signature.
 *
 * Token format:  base64url( grantId.uaPattern.expiryUnix.sigHex )
 * HMAC message:  grantId.uaPattern.normalizedUrl.expiryUnix
 */
async function signHmacToken(
  key: CryptoKey,
  grantId: string,
  uaPattern: string,
  normalizedUrl: string,
  expiryUnix: number
): Promise<string> {
  const message = `${grantId}.${uaPattern}.${normalizedUrl}.${expiryUnix}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  const sigHex = Buffer.from(sig).toString("hex");
  const raw = `${grantId}.${uaPattern}.${expiryUnix}.${sigHex}`;
  return Buffer.from(raw).toString("base64url");
}

// ---------------------------------------------------------------------------
// Batch debit RPC wrapper
// ---------------------------------------------------------------------------

interface BatchDebitInput {
  publisher_workspace_id: string;
  catalog_id: string;
  bot_id: string;
  ua_pattern: string;
  url: string;
  price_eur: number;
  ttl_minutes: number;
}

interface BatchGrantResult {
  url: string;
  grant_id: string;
  expires_at: string;
  cached: boolean;
}

interface BatchDebitSuccess {
  success: true;
  new_balance: number;
  grants: BatchGrantResult[];
}

interface BatchDebitFailure {
  success: false;
  reason: "insufficient_balance";
  balance: number;
  required: number;
}

type BatchDebitResult = BatchDebitSuccess | BatchDebitFailure;

async function batchDebitAndGrant(
  apiKeyId: string,
  consumerWorkspaceId: string,
  botId: string,
  debits: BatchDebitInput[],
  supabase: SupabaseClient
): Promise<BatchDebitResult> {
  if (debits.length === 0) {
    // Short-circuit: no URLs to grant, just return the current bot subscription balance
    // for the bot subscription the API key points to. The bot subscription is resolved via the
    // api_key (since migration 025 the bot subscription lives on its own entity).
    const { data: apiKey } = await supabase
      .from("api_keys")
      .select("bot_subscription_id")
      .eq("id", apiKeyId)
      .single();

    if (!apiKey?.bot_subscription_id) {
      return { success: true, new_balance: 0, grants: [] };
    }

    const { data: botSubscription } = await supabase
      .from("bot_subscriptions")
      .select("balance_eur")
      .eq("id", apiKey.bot_subscription_id)
      .single();

    return {
      success: true,
      new_balance: botSubscription?.balance_eur ?? 0,
      grants: [],
    };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "authorize_and_debit_batch",
    {
      p_api_key_id: apiKeyId,
      p_debits: debits.map((d) => ({
        publisher_workspace_id: d.publisher_workspace_id,
        catalog_id: d.catalog_id,
        bot_id: d.bot_id,
        ua_pattern: d.ua_pattern,
        url: d.url,
        price_eur: d.price_eur,
        ttl_minutes: d.ttl_minutes,
      })),
    }
  );

  if (rpcError) {
    throw new Error(`batchDebitAndGrant RPC error: ${rpcError.message}`);
  }

  const result = rpcData as unknown as {
    success: boolean;
    new_balance?: number;
    grants?: BatchGrantResult[];
    reason?: string;
    balance?: number;
    required?: number;
  };

  if (!result.success) {
    return {
      success: false,
      reason: "insufficient_balance",
      balance: result.balance ?? 0,
      required: result.required ?? 0,
    };
  }

  if (!result.grants || !Array.isArray(result.grants)) {
    throw new Error("batchDebitAndGrant: RPC returned success but no grants array");
  }

  for (const grant of result.grants) {
    if (!grant.grant_id || !grant.expires_at) {
      throw new Error(
        `batchDebitAndGrant: RPC returned grant with missing grant_id or expires_at for url=${grant.url}`
      );
    }
  }

  return {
    success: true,
    new_balance: result.new_balance ?? 0,
    grants: result.grants,
  };
  // botId is part of the function signature for symmetry with caller intent;
  // currently unused inside this helper.
  void botId;
}

// ---------------------------------------------------------------------------
// Bot resolution + catalog access — shared by /licenses and /sources
// ---------------------------------------------------------------------------

interface ResolvedBot {
  bot: BotRecord;
  uaPattern: string;
  declaredIps: Set<string>;
}

/**
 * Resolve and validate a consumer bot for the given workspace:
 *   - bot exists
 *   - bot is active for the workspace (workspace_bots row present)
 *   - bot has at least one declared IP
 */
async function resolveConsumerBot(
  botId: string,
  workspaceId: string
): Promise<ServiceResult<ResolvedBot>> {
  const bot = await getBotById(botId);
  if (!bot) {
    return err("bot_not_found", 404, { bot_id: botId });
  }

  const isActive = await isBotActiveForWorkspace(bot.id, workspaceId);
  if (!isActive) {
    return err("bot_not_in_workspace", 403, { bot_id: botId });
  }

  if (!bot.declared_ips || bot.declared_ips.length === 0) {
    return err("bot_missing_ips", 422, {
      bot_id: botId,
      message: "Bot must have declared IP ranges to participate in paid transactions",
    });
  }

  return ok({
    bot,
    uaPattern: bot.ua_pattern,
    declaredIps: new Set(bot.declared_ips),
  });
}

interface AccessibleCatalogInfo {
  catalog: CatalogRecord;
  allowedIps: string[];
}

/**
 * For a candidate set of catalog IDs, compute which are accessible to the
 * given consumer bot, and the IP intersection per catalog.
 *
 * Logic:
 *   1. Load catalog_bots for the candidate catalog_ids.
 *   2. Keep links whose bot.ua_pattern equals the consumer's uaPattern.
 *   3. Compute IP intersection between consumer's declared_ips and the
 *      publisher bot's declared_ips. Accumulate (UNION) across multiple
 *      UA-matching publisher bots on the same catalog — fixes the prior
 *      "last-wins" overwrite (bug 2.3).
 *   4. Drop catalogs with empty intersection.
 *   5. Load CatalogRecords for the survivors with status=active filter,
 *      optional maxPriceEur, and optional scopeWorkspaceId (when
 *      scope_to_workspace=true on the bot_subscriptions row).
 *
 * Returns:
 *   - accessible: Map<catalog_id, { catalog, allowedIps }>
 *   - uaCompatibleCatalogIds: Set of catalogs whose bot UA matches
 *     (regardless of IP intersection) — used to distinguish
 *     "no_catalog" from "no_matching_ips" in /licenses.
 */
async function filterAccessibleCatalogs(
  candidateCatalogIds: string[],
  consumerBot: ResolvedBot,
  options: {
    scopeWorkspaceId?: string;
    maxPriceEur?: number;
  }
): Promise<{
  accessible: Map<string, AccessibleCatalogInfo>;
  uaCompatibleCatalogIds: Set<string>;
}> {
  if (candidateCatalogIds.length === 0) {
    return { accessible: new Map(), uaCompatibleCatalogIds: new Set() };
  }

  const catalogBotLinks = await getCatalogBots(candidateCatalogIds);
  const uaCompatibleCatalogIds = new Set<string>();
  const catalogIdToAllowedIps = new Map<string, Set<string>>();

  for (const link of catalogBotLinks) {
    if (link.bot.ua_pattern !== consumerBot.uaPattern) continue;
    uaCompatibleCatalogIds.add(link.catalog_id);

    const intersection = link.bot.declared_ips.filter((ip) =>
      consumerBot.declaredIps.has(ip)
    );
    if (intersection.length === 0) continue;

    // UNION across multiple UA-matching publisher bots on the same catalog
    const existing = catalogIdToAllowedIps.get(link.catalog_id) ?? new Set<string>();
    for (const ip of intersection) existing.add(ip);
    catalogIdToAllowedIps.set(link.catalog_id, existing);
  }

  const ipCompatibleIds = [...catalogIdToAllowedIps.keys()];
  if (ipCompatibleIds.length === 0) {
    return { accessible: new Map(), uaCompatibleCatalogIds };
  }

  const catalogs = await getCatalogs(ipCompatibleIds, {
    status: "active",
    maxPriceEur: options.maxPriceEur,
    workspaceId: options.scopeWorkspaceId,
  });

  const accessible = new Map<string, AccessibleCatalogInfo>();
  for (const catalog of catalogs) {
    const ips = catalogIdToAllowedIps.get(catalog.id);
    if (!ips || ips.size === 0) continue;
    accessible.set(catalog.id, { catalog, allowedIps: [...ips] });
  }

  return { accessible, uaCompatibleCatalogIds };
}

// ---------------------------------------------------------------------------
// authorize — main entry point
// ---------------------------------------------------------------------------

/**
 * Pre-authorize content access for a consumer bot.
 *
 * 3-pass design:
 *   Pass 1: Resolve bot, normalize URLs, verify indexed sources exist
 *   Pass 2: Find cheapest valid catalog per URL (ua_pattern reconciliation)
 *   Pass 3: Batch debit + sign bot-bound HMAC tokens
 *
 * @param scopeToWorkspace - When true, only catalogs owned by
 *   `consumerWorkspaceId` are returned. Sourced from
 *   workspace_bots(scope_to_workspace) by the route handler.
 */
export async function authorize(
  consumerWorkspaceId: string,
  apiKeyId: string,
  input: TransactionInput,
  scopeToWorkspace: boolean = false
): Promise<ServiceResult<AuthorizeSuccess>> {
  // ── Pass 1: Resolve bot + normalize + verify indexed sources ──────────

  // bot_id is bound to the API key and injected by the route — always present here.
  if (!input.bot_id) {
    return err("bot_id_required", 422);
  }
  const botId = input.bot_id;

  const resolved = await resolveConsumerBot(botId, consumerWorkspaceId);
  if (!resolved.ok) return resolved;
  const consumerBot = resolved.data;
  const uaPattern = consumerBot.uaPattern;

  const normalizedUrls: Array<{ normalizedUrl: string; domain: string }> = [];
  for (const rawUrl of input.urls) {
    const normalizedUrl = normalizeUrl(rawUrl);
    if (!normalizedUrl) {
      return err("invalid_url", 422, { url: rawUrl });
    }
    const domain = new URL(normalizedUrl).hostname;
    normalizedUrls.push({ normalizedUrl, domain });
  }

  const uniqueDomains = [...new Set(normalizedUrls.map((u) => u.domain))];
  const domainToPublisher = await resolvePublisherDomains(uniqueDomains);

  for (const domain of uniqueDomains) {
    if (!domainToPublisher.has(domain)) {
      return err("domain_not_found", 404, { domain });
    }
  }

  // Find which URLs have an indexed source
  const allNormalized = normalizedUrls.map((u) => u.normalizedUrl);
  const foundSources = await findSourcesByUrls(allNormalized);
  const sourceUrlToId = new Map(foundSources.map((s) => [s.source_url, s.id]));

  const indexed: typeof normalizedUrls = [];
  const unmatched: UnmatchedUrl[] = [];

  for (const entry of normalizedUrls) {
    if (sourceUrlToId.has(entry.normalizedUrl)) {
      indexed.push(entry);
    } else {
      unmatched.push({ url: entry.normalizedUrl, reason: "no_match" });
    }
  }

  // ── Pass 2: Find cheapest valid catalog per URL (ua_pattern match) ────

  const supabase = await createServerClient();

  if (indexed.length === 0) {
    const debitResult = await batchDebitAndGrant(apiKeyId, consumerWorkspaceId, botId, [], supabase);
    return debitResult.success
      ? ok({ results: [], unmatched, total_cost_eur: 0, balance_remaining_eur: debitResult.new_balance })
      : err("insufficient_balance", 402, { balance_eur: debitResult.balance, required_eur: debitResult.required });
  }

  const indexedSourceIds = indexed.map((e) => sourceUrlToId.get(e.normalizedUrl)!);
  const sourceCatalogLinks = await getCatalogIdsBySourceIds(indexedSourceIds);

  // indexed_source_id → catalog_ids
  const sourceIdToCatalogIds = new Map<string, string[]>();
  for (const link of sourceCatalogLinks) {
    const ids = sourceIdToCatalogIds.get(link.indexed_source_id) ?? [];
    ids.push(link.catalog_id);
    sourceIdToCatalogIds.set(link.indexed_source_id, ids);
  }

  // Get all unique catalog_ids from source links
  const allCatalogIds = [...new Set(sourceCatalogLinks.map((l) => l.catalog_id))];

  // Reconcile catalogs against the consumer bot (UA equality + IP intersection
  // + optional workspace scope). See filterAccessibleCatalogs for full logic.
  const { accessible, uaCompatibleCatalogIds } = await filterAccessibleCatalogs(
    allCatalogIds,
    consumerBot,
    {
      scopeWorkspaceId: scopeToWorkspace ? consumerWorkspaceId : undefined,
      maxPriceEur: input.max_price_eur,
    }
  );

  // Pick cheapest usable catalog per URL (IP-compatible candidates only)
  const matched: Array<{
    normalizedUrl: string;
    publisherWorkspaceId: string;
    catalogId: string;
    priceEur: number;
    ttlMinutes: number;
    allowedIps: string[];
  }> = [];

  for (const entry of indexed) {
    const indexedSourceId = sourceUrlToId.get(entry.normalizedUrl)!;
    const catalogIds = sourceIdToCatalogIds.get(indexedSourceId) ?? [];

    let bestCatalog: AccessibleCatalogInfo | null = null;
    for (const catId of catalogIds) {
      const info = accessible.get(catId);
      if (!info) continue;
      if (!bestCatalog || info.catalog.price_eur < bestCatalog.catalog.price_eur) {
        bestCatalog = info;
      }
    }

    if (!bestCatalog) {
      // Distinguish "no catalog at all" from "catalogs exist but none IP-compatible".
      // Note: when scopeToWorkspace=true, a catalog filtered out by scope is reported
      // as "no_catalog" — from the caller's perspective the catalog is invisible.
      const hasUaCompatible = catalogIds.some((id) => uaCompatibleCatalogIds.has(id));
      unmatched.push({
        url: entry.normalizedUrl,
        reason: hasUaCompatible ? "no_matching_ips" : "no_catalog",
      });
      continue;
    }

    matched.push({
      normalizedUrl: entry.normalizedUrl,
      publisherWorkspaceId: domainToPublisher.get(entry.domain)!,
      catalogId: bestCatalog.catalog.id,
      priceEur: bestCatalog.catalog.price_eur,
      ttlMinutes: bestCatalog.catalog.ttl_minutes ?? DEFAULT_TTL_MINUTES,
      allowedIps: bestCatalog.allowedIps,
    });
  }

  // ── Pass 3: Atomic batch debit + sign bot-bound tokens ────────────────

  // Fetch HMAC secrets for involved publishers
  const uniquePublisherIds = [...new Set(matched.map((m) => m.publisherWorkspaceId))];
  const secretMap = new Map<string, string>();

  await Promise.all(
    uniquePublisherIds.map(async (pubId) => {
      const secret = await getWorkspaceSecret(pubId);
      secretMap.set(pubId, secret);
    })
  );

  const debitResult = await batchDebitAndGrant(
    apiKeyId,
    consumerWorkspaceId,
    botId,
    matched.map((m) => ({
      publisher_workspace_id: m.publisherWorkspaceId,
      catalog_id: m.catalogId,
      bot_id: botId,
      ua_pattern: uaPattern,
      url: m.normalizedUrl,
      price_eur: m.priceEur,
      ttl_minutes: m.ttlMinutes,
    })),
    supabase
  );

  if (!debitResult.success) {
    return err("insufficient_balance", 402, {
      balance_eur: debitResult.balance,
      required_eur: debitResult.required,
    });
  }

  // Sign bot-bound HMAC tokens
  const hmacKeyMap = new Map<string, CryptoKey>();
  await Promise.all(
    uniquePublisherIds.map(async (pubId) => {
      const key = await importHmacKey(secretMap.get(pubId)!);
      hmacKeyMap.set(pubId, key);
    })
  );

  const grantByUrl = new Map(debitResult.grants.map((g) => [g.url, g]));

  const results: AuthorizeUrlResult[] = await Promise.all(
    matched.map(async (m) => {
      const grant = grantByUrl.get(m.normalizedUrl)!;
      const expiryUnix = Math.floor(
        new Date(grant.expires_at).getTime() / 1000
      );
      const hmacKey = hmacKeyMap.get(m.publisherWorkspaceId)!;
      const token = await signHmacToken(
        hmacKey,
        grant.grant_id,
        uaPattern,
        m.normalizedUrl,
        expiryUnix
      );

      return {
        url: m.normalizedUrl,
        token,
        price_eur: m.priceEur,
        catalog_id: m.catalogId,
        expires_at: grant.expires_at,
        cached: grant.cached,
        allowed_ips: m.allowedIps,
      };
    })
  );

  const totalCost = results.reduce(
    (sum, r) => sum + (r.cached ? 0 : r.price_eur),
    0
  );

  return ok({
    results,
    unmatched,
    total_cost_eur: totalCost,
    balance_remaining_eur: debitResult.new_balance,
  });
}

// ---------------------------------------------------------------------------
// Discovery endpoints — back /api/consumer/v1/sources and /catalogs
// ---------------------------------------------------------------------------

const SOURCES_DEFAULT_LIMIT = 1000;
const SOURCES_MAX_LIMIT = 5000;
const CATALOG_ID_FILTER_MAX = 50;

interface AccessibleSource {
  id: string;
  url: string;
  path: string | null;
  domain: string;
  best_catalog: {
    id: string;
    name: string;
    price_eur: number;
    ttl_minutes: number;
  };
  allowed_ips: string[];
}

export interface ListAccessibleSourcesSuccess {
  sources: AccessibleSource[];
  /**
   * Opaque cursor (UUID of the last returned source) to fetch the next page.
   * `null` when no more pages.
   */
  next_cursor: string | null;
}

export interface ListAccessibleSourcesOptions {
  /** Optional hostname filter (e.g. "foo.com"). Resolved to domain_id server-side. */
  domain?: string;
  /** Optional path prefix filter (e.g. "/blog/"). Indexed via idx_sources_ws_domain_path. */
  pathPrefix?: string;
  /**
   * Restrict results to this subset of accessible catalogs. Catalogs outside
   * the consumer's accessible set are silently ignored. Capped at
   * CATALOG_ID_FILTER_MAX entries to keep the IN clause bounded.
   */
  catalogIds?: string[];
  /** Max rows per page. Default SOURCES_DEFAULT_LIMIT, hard cap SOURCES_MAX_LIMIT. */
  limit?: number;
  /** Opaque cursor from a previous response's `next_cursor`. */
  cursor?: string;
}

/**
 * List indexed sources accessible to the consumer's bot.
 *
 * Algorithm:
 *   1. Resolve consumer bot (must exist, be active for workspace, have IPs).
 *   2. Find all bots in DB sharing the consumer's ua_pattern.
 *   3. catalog_bots links → candidate catalog_ids (cross-workspace).
 *   4. filterAccessibleCatalogs: UA equality, IP intersection, workspace scope, status=active.
 *   5. Optional ?catalog_id= filter intersected with the accessible set.
 *   6. Optional ?domain= resolved to domain_id (or short-circuit empty if unknown).
 *   7. catalog_sources → indexed_source_ids for accessible catalogs.
 *   8. Single keyset query on indexed_sources: WHERE id IN (...) AND id > $cursor
 *      AND domain_id = ? AND path LIKE prefix% ORDER BY id ASC LIMIT N+1.
 *   9. Per source, pick the cheapest accessible catalog as best_catalog.
 *
 * Cursor pagination: keyset on `indexed_sources.id` (UUIDv4, stable). No HMAC
 * signing — forging a cursor at most jumps to an arbitrary id within the
 * caller's accessible set (no auth/scope bypass possible).
 *
 * @param scopeToWorkspace - When true, only catalogs owned by `workspaceId`
 *   are considered (publisher-managed key, Mode B).
 */
export async function listAccessibleSources(
  workspaceId: string,
  botId: string,
  scopeToWorkspace: boolean,
  options: ListAccessibleSourcesOptions = {}
): Promise<ServiceResult<ListAccessibleSourcesSuccess>> {
  // ── 1. Resolve consumer bot ───────────────────────────────────────────
  const resolved = await resolveConsumerBot(botId, workspaceId);
  if (!resolved.ok) return resolved;
  const consumerBot = resolved.data;

  const limit = Math.min(
    Math.max(options.limit ?? SOURCES_DEFAULT_LIMIT, 1),
    SOURCES_MAX_LIMIT
  );

  const supabase = await createServerClient();

  // ── 2. Find all bots sharing the consumer's ua_pattern ────────────────
  const { data: uaSiblings, error: siblingsError } = await supabase
    .from("bots")
    .select("id")
    .eq("ua_pattern", consumerBot.uaPattern);

  if (siblingsError) {
    throw new Error(`Failed to fetch UA siblings: ${siblingsError.message}`);
  }

  const siblingBotIds = (uaSiblings ?? []).map((b) => b.id);
  if (siblingBotIds.length === 0) {
    return ok({ sources: [], next_cursor: null });
  }

  // ── 3. catalog_bots links → candidate catalog_ids ─────────────────────
  const { data: catalogLinks, error: linksError } = await supabase
    .from("catalog_bots")
    .select("catalog_id")
    .in("bot_id", siblingBotIds);

  if (linksError) {
    throw new Error(`Failed to fetch catalog_bots: ${linksError.message}`);
  }

  const candidateCatalogIds = [...new Set((catalogLinks ?? []).map((l) => l.catalog_id))];
  if (candidateCatalogIds.length === 0) {
    return ok({ sources: [], next_cursor: null });
  }

  // ── 4. Filter to accessible catalogs ──────────────────────────────────
  const { accessible } = await filterAccessibleCatalogs(
    candidateCatalogIds,
    consumerBot,
    {
      scopeWorkspaceId: scopeToWorkspace ? workspaceId : undefined,
    }
  );

  if (accessible.size === 0) {
    return ok({ sources: [], next_cursor: null });
  }

  // ── 5. Apply optional ?catalog_id= filter (intersection) ──────────────
  let accessibleCatalogIds = [...accessible.keys()];
  if (options.catalogIds && options.catalogIds.length > 0) {
    const requested = new Set(options.catalogIds);
    accessibleCatalogIds = accessibleCatalogIds.filter((id) => requested.has(id));
    if (accessibleCatalogIds.length === 0) {
      return ok({ sources: [], next_cursor: null });
    }
  }

  // ── 6. Resolve optional ?domain= to domain_id ─────────────────────────
  let domainIdFilter: string | null = null;
  if (options.domain) {
    const { data: domainRow } = await supabase
      .from("domains")
      .select("id")
      .eq("domain", canonicalizeHostname(options.domain))
      .maybeSingle();
    if (!domainRow) {
      // Unknown domain → consumer asked for a hostname not present in our index.
      // Return empty rather than 404; consistent with "filter that matches nothing".
      return ok({ sources: [], next_cursor: null });
    }
    domainIdFilter = domainRow.id;
  }

  // ── 7. catalog_sources → indexed_source_ids for accessible catalogs ───
  const sourceLinks = await getCatalogSources(accessibleCatalogIds);
  if (sourceLinks.length === 0) {
    return ok({ sources: [], next_cursor: null });
  }

  const sourceIdToCatalogIds = new Map<string, string[]>();
  for (const link of sourceLinks) {
    const ids = sourceIdToCatalogIds.get(link.indexed_source_id) ?? [];
    ids.push(link.catalog_id);
    sourceIdToCatalogIds.set(link.indexed_source_id, ids);
  }

  const allIndexedSourceIds = [...sourceIdToCatalogIds.keys()];

  // ── 8. Keyset query on indexed_sources ────────────────────────────────
  let sourceQuery = supabase
    .from("indexed_sources")
    .select("id, source_url, path, domain_id")
    .in("id", allIndexedSourceIds)
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (options.cursor) {
    sourceQuery = sourceQuery.gt("id", options.cursor);
  }
  if (domainIdFilter) {
    sourceQuery = sourceQuery.eq("domain_id", domainIdFilter);
  }
  if (options.pathPrefix) {
    // path is a generated column "/blog/foo"; LIKE 'prefix%' uses
    // idx_sources_ws_domain_path B-tree. Escape % and _ to keep it a
    // pure prefix match.
    const escaped = options.pathPrefix.replace(/[%_\\]/g, "\\$&");
    sourceQuery = sourceQuery.like("path", `${escaped}%`);
  }

  const { data: sourceRows, error: sourcesError } = await sourceQuery;

  if (sourcesError) {
    throw new Error(`Failed to fetch indexed sources: ${sourcesError.message}`);
  }

  const rawRows = sourceRows ?? [];
  const hasMore = rawRows.length > limit;
  const rows = hasMore ? rawRows.slice(0, limit) : rawRows;
  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].id : null;

  // ── 9. Per source, pick cheapest accessible catalog ───────────────────
  const sources: AccessibleSource[] = [];
  for (const row of rows) {
    const catalogIds = sourceIdToCatalogIds.get(row.id) ?? [];
    let best: AccessibleCatalogInfo | null = null;
    for (const catId of catalogIds) {
      const info = accessible.get(catId);
      if (!info) continue;
      if (!best || info.catalog.price_eur < best.catalog.price_eur) {
        best = info;
      }
    }
    if (!best) continue;

    let domain: string;
    try {
      domain = new URL(row.source_url).hostname;
    } catch {
      continue; // skip malformed URLs defensively
    }

    sources.push({
      id: row.id,
      url: row.source_url,
      path: row.path,
      domain,
      best_catalog: {
        id: best.catalog.id,
        name: best.catalog.name,
        price_eur: best.catalog.price_eur,
        ttl_minutes: best.catalog.ttl_minutes ?? DEFAULT_TTL_MINUTES,
      },
      allowed_ips: best.allowedIps,
    });
  }

  return ok({ sources, next_cursor: nextCursor });
}

// ---------------------------------------------------------------------------
// listAccessibleCatalogs — discovery endpoint backing /api/consumer/v1/catalogs
// ---------------------------------------------------------------------------

interface AccessibleCatalog {
  id: string;
  name: string;
  description: string | null;
  publisher_workspace_id: string;
  price_eur: number;
  ttl_minutes: number;
  rag_enabled: boolean;
  source_count: number;
  allowed_ips: string[];
}

export interface ListAccessibleCatalogsSuccess {
  catalogs: AccessibleCatalog[];
}

/**
 * List all catalogs accessible to the consumer's bot.
 *
 * Same matching logic as `listAccessibleSources` (UA equality + IP intersection
 * + optional workspace scope + status=active), but returns the catalog metadata
 * directly without expanding to sources. Useful for:
 *   - Onboarding: "what can I buy?"
 *   - Pricing comparison
 *   - Pre-filtering /sources calls via ?catalog_id=
 *
 * Volume is small (catalogs « sources), so no pagination — all accessible
 * catalogs are returned in a single response.
 *
 * source_count: total indexed sources linked to the catalog (not de-duplicated
 * across catalogs). Approximate signal of catalog size.
 *
 * @param scopeToWorkspace - When true, only catalogs owned by `workspaceId`
 *   are considered (publisher-managed key, Mode B).
 */
export async function listAccessibleCatalogs(
  workspaceId: string,
  botId: string,
  scopeToWorkspace: boolean
): Promise<ServiceResult<ListAccessibleCatalogsSuccess>> {
  // ── 1. Resolve consumer bot ───────────────────────────────────────────
  const resolved = await resolveConsumerBot(botId, workspaceId);
  if (!resolved.ok) return resolved;
  const consumerBot = resolved.data;

  const supabase = await createServerClient();

  // ── 2. Find UA-sibling bots → candidate catalog_ids ───────────────────
  const { data: uaSiblings, error: siblingsError } = await supabase
    .from("bots")
    .select("id")
    .eq("ua_pattern", consumerBot.uaPattern);

  if (siblingsError) {
    throw new Error(`Failed to fetch UA siblings: ${siblingsError.message}`);
  }

  const siblingBotIds = (uaSiblings ?? []).map((b) => b.id);
  if (siblingBotIds.length === 0) {
    return ok({ catalogs: [] });
  }

  const { data: catalogLinks, error: linksError } = await supabase
    .from("catalog_bots")
    .select("catalog_id")
    .in("bot_id", siblingBotIds);

  if (linksError) {
    throw new Error(`Failed to fetch catalog_bots: ${linksError.message}`);
  }

  const candidateCatalogIds = [...new Set((catalogLinks ?? []).map((l) => l.catalog_id))];
  if (candidateCatalogIds.length === 0) {
    return ok({ catalogs: [] });
  }

  // ── 3. Filter to accessible catalogs ──────────────────────────────────
  const { accessible } = await filterAccessibleCatalogs(
    candidateCatalogIds,
    consumerBot,
    {
      scopeWorkspaceId: scopeToWorkspace ? workspaceId : undefined,
    }
  );

  if (accessible.size === 0) {
    return ok({ catalogs: [] });
  }

  // ── 4. Compute source_count per catalog (single grouped query) ────────
  // Supabase JS doesn't expose GROUP BY directly; we fetch counts per id via
  // head:true count. Catalog count is small (<<1k typical), so N parallel
  // counts are acceptable. Each query uses idx PK on catalog_sources.
  const accessibleIds = [...accessible.keys()];
  const sourceCounts = new Map<string, number>();
  await Promise.all(
    accessibleIds.map(async (catalogId) => {
      const { count } = await supabase
        .from("catalog_sources")
        .select("indexed_source_id", { count: "exact", head: true })
        .eq("catalog_id", catalogId);
      sourceCounts.set(catalogId, count ?? 0);
    })
  );

  // ── 5. Shape the response ─────────────────────────────────────────────
  const catalogs: AccessibleCatalog[] = accessibleIds.map((id) => {
    const info = accessible.get(id)!;
    return {
      id: info.catalog.id,
      name: info.catalog.name,
      description: info.catalog.description,
      publisher_workspace_id: info.catalog.workspace_id,
      price_eur: info.catalog.price_eur,
      ttl_minutes: info.catalog.ttl_minutes ?? DEFAULT_TTL_MINUTES,
      rag_enabled: info.catalog.rag_enabled,
      source_count: sourceCounts.get(id) ?? 0,
      allowed_ips: info.allowedIps,
    };
  });

  // Stable sort: cheapest first, then alphabetical
  catalogs.sort((a, b) => {
    if (a.price_eur !== b.price_eur) return a.price_eur - b.price_eur;
    return a.name.localeCompare(b.name);
  });

  return ok({ catalogs });
}

export const SOURCES_LIMITS = {
  default: SOURCES_DEFAULT_LIMIT,
  max: SOURCES_MAX_LIMIT,
  catalogIdFilterMax: CATALOG_ID_FILTER_MAX,
} as const;
