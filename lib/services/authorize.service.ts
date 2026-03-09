import { createServerClient } from "@/lib/db/supabase-server";
import { authenticateSdkRequest } from "@/lib/services/sdk-auth.service";
import { getWorkspaceRules } from "@/lib/services/sdk.service";
import { normalizeUrl } from "@/lib/utils/url-normalize";
import { SignJWT } from "jose";
import type { AuthorizeInput } from "@/lib/validations/authorize.schema";

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

// ---------------------------------------------------------------------------
// RPC result type
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Orchestrate the 9-step pre-authorization flow.
 *
 * 1. Authenticate consumer via API key
 * 2. Normalize the requested URL
 * 3. Identify publisher by verified domain
 * 4. Fetch publisher rules (user_agents, catalogs, jwt_signing_secret)
 * 5. Match consumer's User-Agent against publisher's declared bots
 * 6. Find matching catalog (url_patterns + agent_ids)
 * 7. Check max_price_eur ceiling (if provided)
 * 8. Call RPC check_cache_and_debit (atomic debit + grant)
 * 9. Sign JWT with publisher's jwt_signing_secret
 *
 * CRITICAL: This function NEVER throws. All errors are returned as typed results.
 *
 * @param authHeader - Authorization header (Bearer df_...)
 * @param userAgent  - User-Agent header from the consumer bot
 * @param input      - Validated request body { url, max_price_eur? }
 * @returns Typed result: success (with JWT), free (bot not tracked), or error
 */
export async function authorize(
  authHeader: string | null,
  userAgent: string | null,
  input: AuthorizeInput
): Promise<AuthorizeResult> {
  // 1. Authenticate consumer via API key
  const authResult = await authenticateSdkRequest(authHeader);
  if ("error" in authResult) {
    return { error: "invalid_api_key", status: 401 };
  }
  const consumerWorkspaceId = authResult.workspaceId;

  // 2. Normalize URL
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(input.url);
  } catch {
    return { error: "invalid_url", status: 422 };
  }

  // 3. Extract domain and find publisher
  const urlObj = new URL(normalizedUrl);
  const domain = urlObj.hostname;

  const supabase = await createServerClient();
  const { data: domainRecord } = await supabase
    .from("domains")
    .select("workspace_id")
    .eq("domain", domain)
    .eq("status", "verified")
    .single();

  if (!domainRecord) {
    return { error: "domain_not_found", status: 404 };
  }
  const publisherWorkspaceId = domainRecord.workspace_id;

  // 4. Fetch publisher rules (includes jwt_signing_secret)
  const rules = await getWorkspaceRules(publisherWorkspaceId);

  // 5. Match user-agent against publisher's declared bots
  const ua = userAgent ?? "";
  const uaLower = ua.toLowerCase();
  const matchedAgent = rules.user_agents.find((agent) =>
    uaLower.includes(agent.ua_pattern.toLowerCase())
  );

  if (!matchedAgent) {
    return { access: "free", reason: "bot_not_tracked" };
  }

  // 6. Find matching catalog (first match, ordered by created_at ASC)
  const urlPath = urlObj.pathname;
  let matchedCatalog: (typeof rules.catalogs)[number] | null = null;

  for (const catalog of rules.catalogs) {
    if (!catalog.agent_ids.includes(matchedAgent.id)) continue;

    for (const pattern of catalog.url_patterns) {
      try {
        if (new RegExp(pattern).test(urlPath)) {
          matchedCatalog = catalog;
          break;
        }
      } catch {
        /* skip invalid regex */
      }
    }
    if (matchedCatalog) break;
  }

  if (!matchedCatalog) {
    return { error: "no_catalog", status: 403 };
  }

  // 7. Check max_price_eur ceiling (US-001-004)
  if (
    input.max_price_eur !== undefined &&
    matchedCatalog.price_eur > input.max_price_eur
  ) {
    return {
      error: "price_exceeds_max",
      status: 402,
      details: {
        price_eur: matchedCatalog.price_eur,
        max_price_eur: input.max_price_eur,
      },
    };
  }

  // 8. Call RPC check_cache_and_debit (atomic transaction)
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "check_cache_and_debit",
    {
      p_consumer_id: consumerWorkspaceId,
      p_publisher_id: publisherWorkspaceId,
      p_url: normalizedUrl,
      p_catalog_id: matchedCatalog.id,
      p_price_eur: matchedCatalog.price_eur,
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
        required_eur: matchedCatalog.price_eur,
      },
    };
  }

  // 9. Sign JWT with publisher's jwt_signing_secret (HS256, jose)
  const secret = new TextEncoder().encode(rules.jwt_signing_secret);
  const token = await new SignJWT({
    sub: consumerWorkspaceId,
    pub: publisherWorkspaceId,
    url: normalizedUrl,
    cat: matchedCatalog.id,
    amt: matchedCatalog.price_eur,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(rpcResult.grant_id)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);

  return {
    access: "granted",
    cached: rpcResult.cached,
    price_eur: matchedCatalog.price_eur,
    balance_remaining_eur: rpcResult.new_balance,
    token,
    expires_at: rpcResult.expires_at,
  };
}
