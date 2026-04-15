// ---------------------------------------------------------------------------
// Consumer service
//
// Business logic for the consumer API (crawler operators).
// Handles content authorization (pre-purchase of signed tokens).
//
// Design:
//   - Source-based matching: only indexed URLs can be purchased
//   - ua_pattern reconciliation: consumer agent matched to publisher catalogs
//     via ua_pattern (not strict agent_id), so preset and operator agents unify
//   - Bot-bound tokens: ua_pattern encoded in HMAC signature, gateway verifies
//   - Publisher-controlled TTL: catalog.ttl_minutes, not consumer-provided
//   - declared_ips required: agents without IP ranges cannot participate
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { resolvePublisherDomains } from "@/lib/db/queries/domains";
import { getWorkspaceSecret } from "@/lib/db/queries/workspaces";
import { findSourcesByUrls } from "@/lib/db/queries/sources";
import { getCatalogIdsBySourceIds, getCatalogs } from "@/lib/db/queries/catalogs";
import { getAgentById, getCatalogAgents } from "@/lib/db/queries/agents";
import { normalizeUrl } from "@liquad/sdk/url-normalize";
import { ok, err, type ServiceResult } from "@/lib/utils/service-result";
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
}

interface UnmatchedUrl {
  url: string;
  reason: "no_match" | "no_catalog";
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
  agent_id: string;
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
  consumerWorkspaceId: string,
  debits: BatchDebitInput[],
  supabase: SupabaseClient
): Promise<BatchDebitResult> {
  if (debits.length === 0) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("balance_eur")
      .eq("id", consumerWorkspaceId)
      .single();

    return {
      success: true,
      new_balance: ws?.balance_eur ?? 0,
      grants: [],
    };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "authorize_and_debit_batch",
    {
      p_consumer_id: consumerWorkspaceId,
      p_debits: debits.map((d) => ({
        publisher_workspace_id: d.publisher_workspace_id,
        catalog_id: d.catalog_id,
        agent_id: d.agent_id,
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
}

// ---------------------------------------------------------------------------
// authorize — main entry point
// ---------------------------------------------------------------------------

/**
 * Pre-authorize content access for a consumer bot.
 *
 * 3-pass design:
 *   Pass 1: Resolve agent, normalize URLs, verify sources exist
 *   Pass 2: Find cheapest valid catalog per URL (ua_pattern reconciliation)
 *   Pass 3: Batch debit + sign bot-bound HMAC tokens
 */
export async function authorize(
  consumerWorkspaceId: string,
  input: TransactionInput
): Promise<ServiceResult<AuthorizeSuccess>> {
  // ── Pass 1: Resolve agent + normalize + verify sources ────────────────

  // Resolve consumer's agent — need ua_pattern for matching and token signing
  const agent = await getAgentById(input.agent_id);
  if (!agent) {
    return err("agent_not_found", 404, { agent_id: input.agent_id });
  }

  // Require declared_ips for paid transactions (prevent unverifiable bot identity)
  if (!agent.declared_ips || agent.declared_ips.length === 0) {
    return err("agent_missing_ips", 422, {
      agent_id: input.agent_id,
      message: "Agent must have declared IP ranges to participate in paid transactions",
    });
  }

  const uaPattern = agent.ua_pattern;

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
    const debitResult = await batchDebitAndGrant(consumerWorkspaceId, [], supabase);
    return debitResult.success
      ? ok({ results: [], unmatched, total_cost_eur: 0, balance_remaining_eur: debitResult.new_balance })
      : err("insufficient_balance", 402, { balance_eur: debitResult.balance, required_eur: debitResult.required });
  }

  const sourceIds = indexed.map((e) => sourceUrlToId.get(e.normalizedUrl)!);
  const sourceCatalogLinks = await getCatalogIdsBySourceIds(sourceIds);

  // source_id → catalog_ids
  const sourceIdToCatalogIds = new Map<string, string[]>();
  for (const link of sourceCatalogLinks) {
    const ids = sourceIdToCatalogIds.get(link.source_id) ?? [];
    ids.push(link.catalog_id);
    sourceIdToCatalogIds.set(link.source_id, ids);
  }

  // Get all unique catalog_ids from source links
  const allCatalogIds = [...new Set(sourceCatalogLinks.map((l) => l.catalog_id))];

  // Reconciliation: find catalogs linked to agents with matching ua_pattern
  const catalogAgentLinks = await getCatalogAgents(allCatalogIds);
  const catalogsWithMatchingAgent = new Set(
    catalogAgentLinks
      .filter((link) => link.agent.ua_pattern === uaPattern)
      .map((link) => link.catalog_id)
  );

  // Fetch catalog details (active + price filter) only for matching catalogs
  const relevantCatalogIds = allCatalogIds.filter((id) => catalogsWithMatchingAgent.has(id));

  const catalogs = await getCatalogs(relevantCatalogIds, {
    status: "active",
    maxPriceEur: input.max_price_eur,
  });
  const catalogMap = new Map(catalogs.map((c) => [c.id, c]));

  // Pick cheapest valid catalog per URL
  const matched: Array<{
    normalizedUrl: string;
    publisherWorkspaceId: string;
    catalogId: string;
    priceEur: number;
    ttlMinutes: number;
  }> = [];

  for (const entry of indexed) {
    const sourceId = sourceUrlToId.get(entry.normalizedUrl)!;
    const catalogIds = sourceIdToCatalogIds.get(sourceId) ?? [];

    let bestCatalog: { id: string; price_eur: number; ttl_minutes: number | null } | null = null;
    for (const catId of catalogIds) {
      const cat = catalogMap.get(catId);
      if (cat && (!bestCatalog || cat.price_eur < bestCatalog.price_eur)) {
        bestCatalog = cat;
      }
    }

    if (!bestCatalog) {
      unmatched.push({ url: entry.normalizedUrl, reason: "no_catalog" });
      continue;
    }

    matched.push({
      normalizedUrl: entry.normalizedUrl,
      publisherWorkspaceId: domainToPublisher.get(entry.domain)!,
      catalogId: bestCatalog.id,
      priceEur: bestCatalog.price_eur,
      ttlMinutes: bestCatalog.ttl_minutes ?? DEFAULT_TTL_MINUTES,
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
    consumerWorkspaceId,
    matched.map((m) => ({
      publisher_workspace_id: m.publisherWorkspaceId,
      catalog_id: m.catalogId,
      agent_id: input.agent_id,
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
