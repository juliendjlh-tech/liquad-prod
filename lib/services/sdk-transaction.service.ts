// ---------------------------------------------------------------------------
// SDK Transaction service
//
// Pre-authorize content access for a consumer bot.
// Accepts batch URLs + explicit agent_id, debits balance per URL,
// and returns HMAC-signed tokens for local verification by the SDK.
//
// Architecture: 2-pass design
//   Pass 1: Resolve publishers, fetch match data, match URLs (read-only)
//   Pass 2: Batch debit + sign tokens (single atomic RPC)
//
// Uses ServiceResult<T> for consistent error handling.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import { resolvePublisherDomains } from "@/lib/db/queries/domains";
import { getPublisherMatchData, type PublisherMatchData } from "@/lib/db/queries/publisher-match-data";
import { matchRequest } from "@liquad/sdk/matcher";
import { normalizeUrl } from "@liquad/sdk/url-normalize";
import { ok, err, type ServiceResult } from "@/lib/utils/service-result";
import type { TransactionInput } from "@/lib/validations/authorize.schema";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransactionUrlResult {
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

export interface TransactionSuccess {
  results: TransactionUrlResult[];
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

async function signHmacToken(
  key: CryptoKey,
  grantId: string,
  normalizedUrl: string,
  expiryUnix: number
): Promise<string> {
  const message = `${grantId}.${normalizedUrl}.${expiryUnix}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  const sigHex = Buffer.from(sig).toString("hex");
  const raw = `${grantId}.${expiryUnix}.${sigHex}`;
  return Buffer.from(raw).toString("base64url");
}

// ---------------------------------------------------------------------------
// Batch debit RPC wrapper
// ---------------------------------------------------------------------------

interface BatchDebitInput {
  publisher_workspace_id: string;
  catalog_id: string;
  agent_id: string;
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
    // No debits needed (e.g., all unmatched). Fetch current balance.
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
    "check_cache_and_debit_batch",
    {
      p_consumer_id: consumerWorkspaceId,
      p_debits: debits.map((d) => ({
        publisher_workspace_id: d.publisher_workspace_id,
        catalog_id: d.catalog_id,
        agent_id: d.agent_id,
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

  // Validate RPC response integrity
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
// createTransaction — main entry point
// ---------------------------------------------------------------------------

export async function createTransaction(
  consumerWorkspaceId: string,
  input: TransactionInput
): Promise<ServiceResult<TransactionSuccess>> {
  // -----------------------------------------------------------------------
  // PASS 1: Resolve + Match (read-only, no debits)
  // -----------------------------------------------------------------------

  // 1a. Normalize all URLs and extract unique domains
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

  // 1b. Batch resolve all domains → publisher workspace IDs (1 query)
  const domainToPublisher = await resolvePublisherDomains(uniqueDomains);

  // Check all domains are known
  for (const domain of uniqueDomains) {
    if (!domainToPublisher.has(domain)) {
      return err("domain_not_found", 404, { domain });
    }
  }

  // 1c. Fetch publisher data for each unique publisher workspace (deduplicated)
  const uniquePublisherIds = [
    ...new Set(domainToPublisher.values()),
  ];
  const publisherDataMap = new Map<string, PublisherMatchData>();

  await Promise.all(
    uniquePublisherIds.map(async (publisherId) => {
      const data = await getPublisherMatchData(publisherId, {
        maxPriceEur: input.max_price_eur,
      });
      publisherDataMap.set(publisherId, data);
    })
  );

  // Verify all publishers have HMAC secrets
  for (const [publisherId, data] of publisherDataMap) {
    if (!data.hmacSecret) {
      return err("publisher_not_configured", 500, { publisher_workspace_id: publisherId });
    }
  }

  // 1d. Match each URL against publisher's agents/catalogs
  const matched: Array<{
    normalizedUrl: string;
    publisherWorkspaceId: string;
    catalogId: string;
    agentId: string;
    priceEur: number;
  }> = [];
  const unmatched: UnmatchedUrl[] = [];

  for (const { normalizedUrl, domain } of normalizedUrls) {
    const publisherWsId = domainToPublisher.get(domain)!;
    const publisherData = publisherDataMap.get(publisherWsId)!;

    const match = matchRequest({
      normalizedUrl,
      agentIds: [input.agent_id],
      agents: publisherData.agents,
      catalogs: publisherData.catalogs,
      maxPrice: input.max_price_eur,
    });

    if (match.type === "no_match") {
      unmatched.push({ url: normalizedUrl, reason: "no_match" });
      continue;
    }

    if (match.type === "no_catalog") {
      unmatched.push({ url: normalizedUrl, reason: "no_catalog" });
      continue;
    }

    matched.push({
      normalizedUrl,
      publisherWorkspaceId: publisherWsId,
      catalogId: match.catalog_id,
      agentId: match.agent_id,
      priceEur: match.price_eur,
    });
  }

  // -----------------------------------------------------------------------
  // PASS 2: Atomic batch debit + sign tokens
  // -----------------------------------------------------------------------

  const supabase = await createServerClient();

  // 2a. Batch debit (single atomic RPC)
  const debitResult = await batchDebitAndGrant(
    consumerWorkspaceId,
    matched.map((m) => ({
      publisher_workspace_id: m.publisherWorkspaceId,
      catalog_id: m.catalogId,
      agent_id: m.agentId,
      url: m.normalizedUrl,
      price_eur: m.priceEur,
      ttl_minutes: input.ttl_minutes,
    })),
    supabase
  );

  if (!debitResult.success) {
    return err("insufficient_balance", 402, {
      balance_eur: debitResult.balance,
      required_eur: debitResult.required,
    });
  }

  // 2b. Import HMAC keys once per publisher
  const hmacKeyMap = new Map<string, CryptoKey>();
  await Promise.all(
    uniquePublisherIds.map(async (publisherId) => {
      const secret = publisherDataMap.get(publisherId)!.hmacSecret;
      const key = await importHmacKey(secret);
      hmacKeyMap.set(publisherId, key);
    })
  );

  // 2c. Sign tokens (parallel)
  const grantByUrl = new Map(
    debitResult.grants.map((g) => [g.url, g])
  );

  const results: TransactionUrlResult[] = await Promise.all(
    matched.map(async (m) => {
      const grant = grantByUrl.get(m.normalizedUrl)!;
      const expiryUnix = Math.floor(
        new Date(grant.expires_at).getTime() / 1000
      );
      const hmacKey = hmacKeyMap.get(m.publisherWorkspaceId)!;
      const token = await signHmacToken(
        hmacKey,
        grant.grant_id,
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

  // Calculate total cost (cached grants are free)
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
