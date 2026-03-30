import { createServerClient } from "@/lib/db/supabase-server";
import { authenticateSdkRequest } from "@/lib/services/sdk-auth.service";
import { getWorkspaceRules, type SdkRules } from "@/lib/services/sdk.service";
import { normalizeUrl } from "@/lib/utils/url-normalize";
import { SignJWT } from "jose";
import type { AuthorizeInput } from "@/lib/validations/authorize.schema";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Filter matching (structured, no regex)
// ---------------------------------------------------------------------------

interface MatchPathRule {
  operator: string;
  value: string;
}

interface MatchDomainRule {
  domain: string;
  path_rules?: MatchPathRule[];
  path_logic?: "AND" | "OR";
}

function evaluatePathRule(pathname: string, rule: MatchPathRule): boolean {
  switch (rule.operator) {
    case "contains":
      return pathname.includes(rule.value);
    case "not_contains":
      return !pathname.includes(rule.value);
    case "starts_with":
      return pathname.startsWith(rule.value);
    case "not_starts_with":
      return !pathname.startsWith(rule.value);
    case "equals":
      return pathname === rule.value;
    case "ends_with":
      return pathname.endsWith(rule.value);
    default:
      return false;
  }
}

function matchFilterRules(
  hostname: string,
  pathname: string,
  filterRules: { domain_rules: MatchDomainRule[] }
): boolean {
  const matchingRules = filterRules.domain_rules.filter(
    (r) => r.domain === hostname
  );
  if (matchingRules.length === 0) return false;

  for (const rule of matchingRules) {
    if (!rule.path_rules || rule.path_rules.length === 0) return true;
    const logic = rule.path_logic ?? "AND";
    const matches =
      logic === "AND"
        ? rule.path_rules.every((pr) => evaluatePathRule(pathname, pr))
        : rule.path_rules.some((pr) => evaluatePathRule(pathname, pr));
    if (matches) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthorizeSuccess {
  access: "granted";
  cached?: boolean;
  price_eur?: number;
  balance_remaining_eur?: number;
  token: string;
  expires_at: string;
}

interface AuthorizeFree {
  access: "free";
  reason: "bot_not_tracked";
}

interface AuthorizeError {
  error: string;
  status: number;
  details?: Record<string, unknown>;
}

type AuthorizeResult = AuthorizeSuccess | AuthorizeFree | AuthorizeError;

interface RpcSuccess {
  success: true;
  cached: boolean;
  grant_id: string;
  new_balance: number;
  expires_at: string;
}

interface RpcFailure {
  success: false;
  reason: string;
  balance: number;
}

type RpcResult = RpcSuccess | RpcFailure;

interface ParsedUrl {
  normalizedUrl: string;
  domain: string;
  path: string;
}

interface MatchResult {
  agent: SdkRules["agents"][number];
  catalog: SdkRules["catalogs"][number];
}

// ---------------------------------------------------------------------------
// Step functions
// ---------------------------------------------------------------------------

async function authenticateConsumer(
  authHeader: string | null
): Promise<{ workspaceId: string } | AuthorizeError> {
  const result = await authenticateSdkRequest(authHeader);
  if ("error" in result) {
    return { error: "invalid_api_key", status: 401 };
  }
  return { workspaceId: result.workspaceId };
}

function parseAndNormalizeUrl(rawUrl: string): ParsedUrl | AuthorizeError {
  const normalizedUrl = normalizeUrl(rawUrl);
  if (!normalizedUrl) {
    return { error: "invalid_url", status: 422 };
  }
  const urlObj = new URL(normalizedUrl);
  return {
    normalizedUrl,
    domain: urlObj.hostname,
    path: urlObj.pathname,
  };
}

async function resolvePublisher(
  supabase: SupabaseClient,
  domain: string
): Promise<{ workspaceId: string } | AuthorizeError> {
  const { data: domainRecord } = await supabase
    .from("domains")
    .select("workspace_id")
    .eq("domain", domain)
    .eq("status", "verified")
    .single();

  if (!domainRecord) {
    return { error: "domain_not_found", status: 404 };
  }
  return { workspaceId: domainRecord.workspace_id };
}

function matchAgentAndCatalog(
  rules: SdkRules,
  userAgent: string | null,
  parsed: ParsedUrl
): MatchResult | AuthorizeFree | AuthorizeError {
  // Match user-agent
  const ua = (userAgent ?? "").toLowerCase();
  const matchedAgent = rules.agents.find((agent) =>
    ua.includes(agent.ua_pattern.toLowerCase())
  );

  if (!matchedAgent) {
    return { access: "free", reason: "bot_not_tracked" };
  }

  // Check content existence
  const contentKey = normalizeUrl(`https://${parsed.domain}${parsed.path}`);
  const pathSet = new Set(rules.known_content_paths);
  if (!contentKey || !pathSet.has(contentKey)) {
    return { error: "content_not_found", status: 404 };
  }

  // Find best matching catalog (lowest price)
  const agentCatalogIds = new Set(matchedAgent.catalog_ids);
  const allMatches = rules.catalogs
    .filter(
      (catalog) =>
        agentCatalogIds.has(catalog.id) &&
        matchFilterRules(parsed.domain, parsed.path, catalog.filter_rules)
    )
    .sort((a, b) => a.price_eur - b.price_eur);

  if (allMatches.length === 0) {
    return { error: "no_catalog", status: 403 };
  }

  return { agent: matchedAgent, catalog: allMatches[0] };
}

function checkPriceCeiling(
  catalog: SdkRules["catalogs"][number],
  maxPriceEur?: number
): AuthorizeError | null {
  if (maxPriceEur !== undefined && catalog.price_eur > maxPriceEur) {
    return {
      error: "price_exceeds_max",
      status: 402,
      details: {
        price_eur: catalog.price_eur,
        max_price_eur: maxPriceEur,
      },
    };
  }
  return null;
}

async function debitAndGrant(
  supabase: SupabaseClient,
  consumerWorkspaceId: string,
  publisherWorkspaceId: string,
  normalizedUrl: string,
  catalog: SdkRules["catalogs"][number]
): Promise<RpcSuccess | AuthorizeError> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "check_cache_and_debit",
    {
      p_consumer_id: consumerWorkspaceId,
      p_publisher_id: publisherWorkspaceId,
      p_url: normalizedUrl,
      p_catalog_id: catalog.id,
      p_price_eur: catalog.price_eur,
      p_ttl_minutes: 5,
    }
  );

  if (rpcError) {
    return { error: "internal_error", status: 500 };
  }

  const rpcResult = rpcData as unknown as RpcResult;

  if (!rpcResult.success) {
    return {
      error: "insufficient_balance",
      status: 402,
      details: {
        balance_eur: rpcResult.balance,
        required_eur: catalog.price_eur,
      },
    };
  }

  return rpcResult;
}

async function signAccessToken(
  jwtSigningSecret: string,
  params: {
    consumerWorkspaceId: string;
    publisherWorkspaceId: string;
    normalizedUrl: string;
    catalogId: string;
    priceEur: number;
    grantId: string;
  }
): Promise<string> {
  const secret = new TextEncoder().encode(jwtSigningSecret);
  return new SignJWT({
    sub: params.consumerWorkspaceId,
    pub: params.publisherWorkspaceId,
    url: params.normalizedUrl,
    cat: params.catalogId,
    amt: params.priceEur,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(params.grantId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function authorize(
  authHeader: string | null,
  userAgent: string | null,
  input: AuthorizeInput
): Promise<AuthorizeResult> {
  // 1. Authenticate consumer
  const consumer = await authenticateConsumer(authHeader);
  if ("error" in consumer) return consumer;

  // 2. Parse and normalize URL
  const parsed = parseAndNormalizeUrl(input.url);
  if ("error" in parsed) return parsed;

  // 3. Resolve publisher from domain
  const supabase = await createServerClient();
  const publisher = await resolvePublisher(supabase, parsed.domain);
  if ("error" in publisher) return publisher;

  // 4. Fetch rules + match agent + find best catalog
  const rules = await getWorkspaceRules(publisher.workspaceId);
  const match = matchAgentAndCatalog(rules, userAgent, parsed);
  if ("error" in match || "access" in match) return match;

  // 5. Check price ceiling
  const priceCheck = checkPriceCeiling(match.catalog, input.max_price_eur);
  if (priceCheck) return priceCheck;

  // 6. Debit balance and create grant
  const grant = await debitAndGrant(
    supabase,
    consumer.workspaceId,
    publisher.workspaceId,
    parsed.normalizedUrl,
    match.catalog
  );
  if ("error" in grant) return grant;

  // 7. Sign access token
  const token = await signAccessToken(rules.jwt_signing_secret, {
    consumerWorkspaceId: consumer.workspaceId,
    publisherWorkspaceId: publisher.workspaceId,
    normalizedUrl: parsed.normalizedUrl,
    catalogId: match.catalog.id,
    priceEur: match.catalog.price_eur,
    grantId: grant.grant_id,
  });

  return {
    access: "granted",
    cached: grant.cached,
    price_eur: match.catalog.price_eur,
    balance_remaining_eur: grant.new_balance,
    token,
    expires_at: grant.expires_at,
  };
}
