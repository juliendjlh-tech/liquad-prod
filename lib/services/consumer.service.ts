// ---------------------------------------------------------------------------
// Consumer service
//
// Business logic for the consumer API (crawler operators).
// Handles content authorization (pre-purchase of signed tokens) and
// discovery of accessible indexed sources.
//
// Design (post-network refactor, migrations 040-042):
//   - Indexed source-based matching: only indexed URLs can be purchased
//   - ua_pattern reconciliation: consumer bot matched to publisher catalogs
//     via ua_pattern (not strict bot_id), so preset and operator bots unify
//   - Bot-bound tokens: ua_pattern encoded in HMAC signature, gateway verifies
//   - Publisher-controlled TTL: catalog.ttl_minutes, not consumer-provided
//   - declared_ips required: bots without IP ranges cannot participate
//   - Network-driven access: the API key's network defines the catalogue set
//     (network_catalogs.status='accepted'). No more subscription-level
//     allowlist, max_price, or workspace scope — all removed in migration 041.
//   - Bot identity is on the API key (api_keys.bot_id), not in the request
//     body. workspace_bots is no longer queried at runtime.
//   - Revenue split (85/7/8) computed in TS (lib/constants/revenue.ts) and
//     passed pre-computed to the RPC.
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
  type BotRecord,
} from "@/lib/db/queries/agents";
import { getNetworkAcceptedCatalogIds } from "@/lib/db/queries/networks";
import { computeRevenueSplit } from "@/lib/constants/revenue";
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

export type AuthorizeReason =
  | "granted"
  | "no_match"
  | "no_catalog"
  | "no_matching_ips"
  | "domain_not_registered"
  | "insufficient_balance";

interface AuthorizeUrlGranted {
  url: string;
  crawl_url: string;
  reason: "granted";
  token: string;
  price_eur: number;
  catalog_id: string;
  expires_at: string;
  cached: boolean;
  allowed_ips: string[];
}

interface AuthorizeUrlUnmatched {
  url: string;
  crawl_url: string;
  reason: Exclude<AuthorizeReason, "granted">;
}

export type AuthorizeUrlResult = AuthorizeUrlGranted | AuthorizeUrlUnmatched;

export interface AuthorizeSuccess {
  results: AuthorizeUrlResult[];
  total_cost_eur: number;
  balance_remaining_eur: number;
}

// Append the HMAC token as a `?_lq=` query param. The publisher SDK strips
// the entire query string during normalization (see @liquad/sdk/url-normalize),
// so any pre-existing query parameters in the original URL are inert for HMAC
// verification — they pass through to the publisher untouched.
function buildCrawlUrl(originalUrl: string, token?: string): string {
  if (!token) return originalUrl;
  try {
    const u = new URL(originalUrl);
    u.searchParams.set("_lq", token);
    return u.toString();
  } catch {
    return originalUrl;
  }
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
  url: string;
  price_eur: number;
  ttl_minutes: number;
  // Pre-computed revenue split (TS is the source of truth for ratios — the RPC
  // stores these amounts as-is into the 4 credit_transactions rows per grant).
  amount_content_owner: number;
  amount_sub_manager: number;
  amount_platform_fee: number;
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
  debits: BatchDebitInput[],
  supabase: SupabaseClient
): Promise<BatchDebitResult> {
  if (debits.length === 0) {
    // No URLs to grant — return the current subscription balance.
    const { data: apiKey } = await supabase
      .from("api_keys")
      .select("subscription_id")
      .eq("id", apiKeyId)
      .single();

    if (!apiKey?.subscription_id) {
      return { success: true, new_balance: 0, grants: [] };
    }

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("balance_eur")
      .eq("id", apiKey.subscription_id)
      .single();

    return {
      success: true,
      new_balance: subscription?.balance_eur ?? 0,
      grants: [],
    };
  }

  // bot_id + ua_pattern are no longer passed: the RPC resolves them from
  // api_keys.bot_id JOIN bots. Amounts are pre-computed in TS to keep the
  // revenue ratios single-sourced.
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "authorize_and_debit_batch",
    {
      p_api_key_id: apiKeyId,
      p_debits: debits.map((d) => ({
        publisher_workspace_id: d.publisher_workspace_id,
        catalog_id: d.catalog_id,
        url: d.url,
        price_eur: d.price_eur,
        ttl_minutes: d.ttl_minutes,
        amount_content_owner: d.amount_content_owner,
        amount_sub_manager: d.amount_sub_manager,
        amount_platform_fee: d.amount_platform_fee,
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
 * Resolve and validate a consumer bot. The bot is already bound to the API key
 * at creation time (api_keys.bot_id) and was validated against the network's
 * derived set (trigger validate_api_key_bot_in_network). Runtime checks here
 * are limited to:
 *   - bot exists in the global registry
 *   - bot has at least one declared IP
 *
 * The workspace_bots junction is no longer queried at runtime — its sole role
 * is curation when populating catalog_bots.
 */
async function resolveConsumerBot(
  botId: string
): Promise<ServiceResult<ResolvedBot>> {
  const bot = await getBotById(botId);
  if (!bot) {
    return err("bot_not_found", 404, { bot_id: botId });
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
 *   1. Restrict candidates to the network's accepted catalogues (allowlist
 *      derived from network_catalogs(network_id, status='accepted')). Empty
 *      allowlist → empty result (an API key references exactly one network).
 *   2. Load catalog_bots for the surviving candidates.
 *   3. Keep links whose bot.ua_pattern equals the consumer's uaPattern.
 *   4. Compute IP intersection between consumer's declared_ips and the
 *      publisher bot's declared_ips. UNION across multiple UA-matching
 *      publisher bots on the same catalog.
 *   5. Drop catalogs with empty IP intersection.
 *   6. Load CatalogRecords for the survivors, restricted to status='active'
 *      (marketplace visibility). A catalogue listed in a network but no
 *      longer 'active' is invisible to the consumer.
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
    /**
     * Network-derived catalogue allowlist (catalogues whose membership is
     * 'accepted'). Required: an API key is always tied to one network.
     */
    networkAcceptedCatalogIds: string[];
  }
): Promise<{
  accessible: Map<string, AccessibleCatalogInfo>;
  uaCompatibleCatalogIds: Set<string>;
}> {
  if (candidateCatalogIds.length === 0 || options.networkAcceptedCatalogIds.length === 0) {
    return { accessible: new Map(), uaCompatibleCatalogIds: new Set() };
  }

  const allowed = new Set(options.networkAcceptedCatalogIds);
  const prunedCandidates = candidateCatalogIds.filter((id) => allowed.has(id));
  if (prunedCandidates.length === 0) {
    return { accessible: new Map(), uaCompatibleCatalogIds: new Set() };
  }

  const catalogBotLinks = await getCatalogBots(prunedCandidates);
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

  // Marketplace visibility: only catalogues currently 'active' are returned.
  // A catalogue accepted in the network but switched to 'inactive' by its
  // owner is silently filtered out — caller sees `no_catalog` for that URL.
  const catalogs = await getCatalogs(ipCompatibleIds, { status: "active" });

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
 * networkId and botId are sourced from the API key by the route handler:
 *   - networkId → the allowed catalogue set (network_catalogs accepted)
 *   - botId     → the bot identity claimed by the key (immutable)
 *
 * No more bot_id in the request body since migration 041. No more
 * scope_to_workspace / max_price_eur / subscription.catalog_ids since they
 * were dropped along with the legacy subscription scope model.
 */
export async function authorize(
  consumerWorkspaceId: string,
  apiKeyId: string,
  networkId: string,
  botId: string,
  input: TransactionInput,
): Promise<ServiceResult<AuthorizeSuccess>> {
  // ── Pass 1: Resolve bot + normalize + verify indexed sources ──────────

  const resolved = await resolveConsumerBot(botId);
  if (!resolved.ok) return resolved;
  const consumerBot = resolved.data;
  const uaPattern = consumerBot.uaPattern;

  // Resolve the network's accepted catalogues once for the whole batch.
  const networkAcceptedCatalogIds = await getNetworkAcceptedCatalogIds(networkId);

  // Each entry preserves the original URL (echoed back to the caller) alongside
  // the normalized URL used for matching and HMAC signing. Entries stay in
  // input order so the response `results[]` mirrors the request `urls[]`.
  interface UrlEntry {
    originalUrl: string;
    normalizedUrl: string;
    domain: string;
  }

  const entries: UrlEntry[] = [];
  for (const rawUrl of input.urls) {
    const normalizedUrl = normalizeUrl(rawUrl);
    if (!normalizedUrl) {
      return err("invalid_url", 422, { url: rawUrl });
    }
    const domain = new URL(normalizedUrl).hostname;
    entries.push({ originalUrl: rawUrl, normalizedUrl, domain });
  }

  const uniqueDomains = [...new Set(entries.map((e) => e.domain))];
  const domainToPublisher = await resolvePublisherDomains(uniqueDomains);

  // Per-entry outcome map (keyed by input index). Filled progressively; any
  // entry without an outcome by Pass 3 is "granted" (unless dégradation kicks in).
  const outcomes = new Map<number, Exclude<AuthorizeReason, "granted">>();
  for (let i = 0; i < entries.length; i++) {
    if (!domainToPublisher.has(entries[i].domain)) {
      outcomes.set(i, "domain_not_registered");
    }
  }

  // Indices still eligible after domain check
  const candidateIndices = entries
    .map((_, i) => i)
    .filter((i) => !outcomes.has(i));

  // Find which candidate URLs have an indexed source
  const candidateNormalized = candidateIndices.map((i) => entries[i].normalizedUrl);
  const foundSources = candidateNormalized.length > 0
    ? await findSourcesByUrls(candidateNormalized)
    : [];
  const sourceUrlToId = new Map(foundSources.map((s) => [s.source_url, s.id]));

  for (const i of candidateIndices) {
    if (!sourceUrlToId.has(entries[i].normalizedUrl)) {
      outcomes.set(i, "no_match");
    }
  }

  // ── Pass 2: Find cheapest valid catalog per indexed URL ────────────────

  const supabase = await createServerClient();

  // Indices indexed (have a source) — eligible for catalog matching
  const indexedIndices = candidateIndices.filter((i) => !outcomes.has(i));

  // Per-URL match info if a usable catalog was found
  interface MatchInfo {
    publisherWorkspaceId: string;
    catalogId: string;
    priceEur: number;
    ttlMinutes: number;
    allowedIps: string[];
  }
  const matches = new Map<number, MatchInfo>();

  if (indexedIndices.length > 0) {
    const indexedSourceIds = indexedIndices.map((i) =>
      sourceUrlToId.get(entries[i].normalizedUrl)!
    );
    const sourceCatalogLinks = await getCatalogIdsBySourceIds(indexedSourceIds);

    const sourceIdToCatalogIds = new Map<string, string[]>();
    for (const link of sourceCatalogLinks) {
      const ids = sourceIdToCatalogIds.get(link.indexed_source_id) ?? [];
      ids.push(link.catalog_id);
      sourceIdToCatalogIds.set(link.indexed_source_id, ids);
    }

    const allCatalogIds = [...new Set(sourceCatalogLinks.map((l) => l.catalog_id))];

    // Reconcile catalogs against the consumer bot (UA equality + IP intersection)
    // restricted to the network's accepted catalogue set.
    // See filterAccessibleCatalogs for full logic.
    const { accessible, uaCompatibleCatalogIds } = await filterAccessibleCatalogs(
      allCatalogIds,
      consumerBot,
      { networkAcceptedCatalogIds }
    );

    for (const i of indexedIndices) {
      const entry = entries[i];
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
        // A catalogue not in the network's accepted set is reported as "no_catalog"
        // — from the caller's perspective the catalogue is invisible.
        const hasUaCompatible = catalogIds.some((id) => uaCompatibleCatalogIds.has(id));
        outcomes.set(i, hasUaCompatible ? "no_matching_ips" : "no_catalog");
        continue;
      }

      matches.set(i, {
        publisherWorkspaceId: domainToPublisher.get(entry.domain)!,
        catalogId: bestCatalog.catalog.id,
        priceEur: bestCatalog.catalog.price_eur,
        ttlMinutes: bestCatalog.catalog.ttl_minutes ?? DEFAULT_TTL_MINUTES,
        allowedIps: bestCatalog.allowedIps,
      });
    }
  }

  // ── Pass 3: Atomic batch debit + sign bot-bound tokens ────────────────

  // Deduplicate matches by normalized URL — multiple input entries pointing to
  // the same normalized URL share a single grant (idempotent within TTL).
  const uniqueMatchEntries = new Map<string, { firstIndex: number; info: MatchInfo }>();
  for (const i of matches.keys()) {
    const url = entries[i].normalizedUrl;
    if (!uniqueMatchEntries.has(url)) {
      uniqueMatchEntries.set(url, { firstIndex: i, info: matches.get(i)! });
    }
  }

  const uniquePublisherIds = [...new Set(
    Array.from(uniqueMatchEntries.values()).map((m) => m.info.publisherWorkspaceId)
  )];

  const secretMap = new Map<string, string>();
  await Promise.all(
    uniquePublisherIds.map(async (pubId) => {
      const secret = await getWorkspaceSecret(pubId);
      secretMap.set(pubId, secret);
    })
  );

  const debitInputs: BatchDebitInput[] = Array.from(uniqueMatchEntries.entries()).map(([url, m]) => {
    const split = computeRevenueSplit(m.info.priceEur);
    return {
      publisher_workspace_id: m.info.publisherWorkspaceId,
      catalog_id: m.info.catalogId,
      url,
      price_eur: m.info.priceEur,
      ttl_minutes: m.info.ttlMinutes,
      amount_content_owner: split.content_owner,
      amount_sub_manager: split.sub_manager,
      amount_platform_fee: split.platform_fee,
    };
  });

  const debitResult = await batchDebitAndGrant(apiKeyId, debitInputs, supabase);
  // consumerWorkspaceId kept in scope for response construction below.
  void consumerWorkspaceId;

  // ── Graceful degradation: insufficient balance ─────────────────────────
  // Instead of failing the whole batch, return 200 with every URL falling back
  // to crawl_url=originalUrl + reason="insufficient_balance". The publisher
  // SDK will block tokenless requests and emit a denial event; URLs hosted on
  // unregistered domains pass through the GPT untouched as before.
  if (!debitResult.success) {
    const results: AuthorizeUrlResult[] = entries.map((entry, i) => {
      const existing = outcomes.get(i);
      // Domain unknown / no source / no catalog stay as-is — they were never
      // going to get a token regardless of balance.
      if (existing) {
        return {
          url: entry.originalUrl,
          crawl_url: entry.originalUrl,
          reason: existing,
        };
      }
      return {
        url: entry.originalUrl,
        crawl_url: entry.originalUrl,
        reason: "insufficient_balance",
      };
    });

    return ok({
      results,
      total_cost_eur: 0,
      balance_remaining_eur: debitResult.balance,
    });
  }

  // Sign bot-bound HMAC tokens (one key per publisher)
  const hmacKeyMap = new Map<string, CryptoKey>();
  await Promise.all(
    uniquePublisherIds.map(async (pubId) => {
      const key = await importHmacKey(secretMap.get(pubId)!);
      hmacKeyMap.set(pubId, key);
    })
  );

  const grantByUrl = new Map(debitResult.grants.map((g) => [g.url, g]));

  // Sign one token per unique normalized URL — duplicate input entries share it
  interface SignedGrant {
    token: string;
    expires_at: string;
    cached: boolean;
  }
  const signedByUrl = new Map<string, SignedGrant>();
  await Promise.all(
    Array.from(uniqueMatchEntries.entries()).map(async ([url, m]) => {
      const grant = grantByUrl.get(url)!;
      const expiryUnix = Math.floor(new Date(grant.expires_at).getTime() / 1000);
      const hmacKey = hmacKeyMap.get(m.info.publisherWorkspaceId)!;
      const token = await signHmacToken(hmacKey, grant.grant_id, uaPattern, url, expiryUnix);
      signedByUrl.set(url, {
        token,
        expires_at: grant.expires_at,
        cached: grant.cached,
      });
    })
  );

  // Build unified results in input order
  const results: AuthorizeUrlResult[] = entries.map((entry, i) => {
    const reason = outcomes.get(i);
    if (reason) {
      return {
        url: entry.originalUrl,
        crawl_url: entry.originalUrl,
        reason,
      };
    }

    const match = matches.get(i)!;
    const signed = signedByUrl.get(entry.normalizedUrl)!;
    return {
      url: entry.originalUrl,
      crawl_url: buildCrawlUrl(entry.originalUrl, signed.token),
      reason: "granted",
      token: signed.token,
      price_eur: match.priceEur,
      catalog_id: match.catalogId,
      expires_at: signed.expires_at,
      cached: signed.cached,
      allowed_ips: match.allowedIps,
    };
  });

  // Total cost: sum of non-cached grants, deduplicated by normalized URL
  let totalCost = 0;
  for (const [, m] of uniqueMatchEntries) {
    const signed = signedByUrl.get(entries[m.firstIndex].normalizedUrl)!;
    if (!signed.cached) totalCost += m.info.priceEur;
  }

  return ok({
    results,
    total_cost_eur: totalCost,
    balance_remaining_eur: debitResult.new_balance,
  });
}

// ---------------------------------------------------------------------------
// Discovery endpoints — back /api/public/v1/consumer/sources and /catalogs
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
 *   1. Resolve consumer bot (must exist, have IPs).
 *   2. Resolve the network's accepted catalogue set once.
 *   3. Find all bots in DB sharing the consumer's ua_pattern.
 *   4. catalog_bots links → candidate catalog_ids (cross-workspace).
 *   5. filterAccessibleCatalogs: UA equality, IP intersection, network membership.
 *   6. Optional ?catalog_id= filter intersected with the accessible set.
 *   7. Optional ?domain= resolved to domain_id (or short-circuit empty if unknown).
 *   8. catalog_sources → indexed_source_ids for accessible catalogs.
 *   9. Single keyset query on indexed_sources.
 *  10. Per source, pick the cheapest accessible catalog as best_catalog.
 *
 * Cursor pagination: keyset on `indexed_sources.id` (UUIDv4, stable).
 *
 * @param workspaceId - Consumer workspace owning the API key (debited).
 * @param networkId   - Network bound to the API key (defines the catalogue set).
 * @param botId       - Bot identity bound to the API key.
 */
export async function listAccessibleSources(
  workspaceId: string,
  networkId: string,
  botId: string,
  options: ListAccessibleSourcesOptions = {},
): Promise<ServiceResult<ListAccessibleSourcesSuccess>> {
  // ── 1. Resolve consumer bot ───────────────────────────────────────────
  const resolved = await resolveConsumerBot(botId);
  if (!resolved.ok) return resolved;
  const consumerBot = resolved.data;
  void workspaceId; // currently unused at runtime; kept for symmetry with /licenses.

  // Resolve the network's accepted catalogues once for the whole query.
  const networkAcceptedCatalogIds = await getNetworkAcceptedCatalogIds(networkId);
  if (networkAcceptedCatalogIds.length === 0) {
    return ok({ sources: [], next_cursor: null });
  }

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
    { networkAcceptedCatalogIds }
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
// listAccessibleCatalogs — discovery endpoint backing /api/public/v1/consumer/catalogs
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
 * + network membership + status=active), but returns the catalog metadata
 * directly without expanding to sources.
 *
 * Volume is small (catalogs « sources), so no pagination.
 *
 * @param workspaceId - Consumer workspace owning the API key.
 * @param networkId   - Network bound to the API key.
 * @param botId       - Bot identity bound to the API key.
 */
export async function listAccessibleCatalogs(
  workspaceId: string,
  networkId: string,
  botId: string,
): Promise<ServiceResult<ListAccessibleCatalogsSuccess>> {
  // ── 1. Resolve consumer bot ───────────────────────────────────────────
  const resolved = await resolveConsumerBot(botId);
  if (!resolved.ok) return resolved;
  const consumerBot = resolved.data;
  void workspaceId;

  // Resolve the network's accepted catalogues once.
  const networkAcceptedCatalogIds = await getNetworkAcceptedCatalogIds(networkId);
  if (networkAcceptedCatalogIds.length === 0) {
    return ok({ catalogs: [] });
  }

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
    { networkAcceptedCatalogIds }
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
