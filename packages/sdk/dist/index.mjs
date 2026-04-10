import {
  toExpressMiddleware
} from "./chunk-PEYN7Q5D.mjs";
import {
  matchRequest,
  matchUserAgent
} from "./chunk-WGQ54YKZ.mjs";
import {
  normalizeUrl
} from "./chunk-VKCI3LJG.mjs";

// src/rules-cache.ts
var MIN_REFRESH_INTERVAL = 1e4;
async function fetchRules(config) {
  const baseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const url = `${baseUrl}/api/sdk/rules`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(1e4)
  });
  if (!resp.ok) {
    throw new Error(`Rules fetch failed with status ${resp.status}`);
  }
  return await resp.json();
}
function createRulesCache(config) {
  let rules = null;
  let lastFetchedAt = 0;
  const interval = Math.max(
    config.refreshInterval ?? 3e5,
    MIN_REFRESH_INTERVAL
  );
  const onError = config.onError ?? (() => {
  });
  return {
    async getOrRefresh() {
      if (rules && Date.now() - lastFetchedAt < interval) {
        return rules;
      }
      try {
        rules = await fetchRules(config);
        lastFetchedAt = Date.now();
      } catch (err) {
        onError(
          err instanceof Error ? err : new Error("Unknown error fetching rules")
        );
      }
      return rules;
    }
  };
}

// src/ip-check.ts
function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return NaN;
  return parts.reduce((acc, octet) => {
    const n = parseInt(octet, 10);
    if (isNaN(n) || n < 0 || n > 255) return NaN;
    return (acc << 8) + n;
  }, 0) >>> 0;
}
function isIpv4InCidr(ip, cidr) {
  const slashIndex = cidr.indexOf("/");
  if (slashIndex === -1) {
    return ip === cidr;
  }
  const network = cidr.slice(0, slashIndex);
  const prefix = parseInt(cidr.slice(slashIndex + 1), 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : ~0 << 32 - prefix >>> 0;
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (isNaN(ipInt) || isNaN(netInt)) return false;
  return (ipInt & mask) === (netInt & mask);
}
function isIpInRanges(ip, ranges) {
  if (!ip || ranges.length === 0) return false;
  if (ip.includes(":")) return false;
  return ranges.some((range) => {
    try {
      return isIpv4InCidr(ip, range);
    } catch {
      return false;
    }
  });
}

// src/token-verify.ts
var cachedSecret = null;
var cachedKey = null;
async function verifyToken(token, normalizedUrl, secret, nowMs) {
  let decoded;
  try {
    decoded = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return { valid: false };
  }
  const dotIdx1 = decoded.indexOf(".");
  const dotIdx2 = decoded.indexOf(".", dotIdx1 + 1);
  if (dotIdx1 === -1 || dotIdx2 === -1) return { valid: false };
  const grantId = decoded.slice(0, dotIdx1);
  const expiryStr = decoded.slice(dotIdx1 + 1, dotIdx2);
  const sigHex = decoded.slice(dotIdx2 + 1);
  if (!grantId || !expiryStr || !sigHex) return { valid: false };
  const expiryUnix = parseInt(expiryStr, 10);
  if (isNaN(expiryUnix)) return { valid: false };
  const expiryMs = expiryUnix * 1e3;
  if ((nowMs ?? Date.now()) >= expiryMs) return { valid: false };
  if (secret !== cachedSecret || !cachedKey) {
    try {
      const keyData = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
      cachedKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      cachedSecret = secret;
    } catch {
      return { valid: false };
    }
  }
  const message = `${grantId}.${normalizedUrl}.${expiryStr}`;
  const hexPairs = sigHex.match(/.{2}/g);
  if (!hexPairs || hexPairs.length !== 32) return { valid: false };
  const sigBytes = new Uint8Array(hexPairs.map((h) => parseInt(h, 16)));
  const valid = await crypto.subtle.verify(
    "HMAC",
    cachedKey,
    sigBytes,
    new TextEncoder().encode(message)
  );
  return valid ? { valid: true, grantId } : { valid: false };
}

// src/event-buffer.ts
function createEventBuffer(config) {
  const buffer = [];
  let timer = null;
  const flushInterval = config.flushIntervalMs ?? 5e3;
  const maxSize = config.maxBufferSize ?? 50;
  function flush() {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0);
    const promise = fetch(`${config.apiBaseUrl}/api/sdk/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ events: batch })
    }).catch((err) => {
      config.onError?.(
        err instanceof Error ? err : new Error("Event flush error")
      );
    });
    if (config.waitUntil) config.waitUntil(promise);
  }
  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, flushInterval);
  }
  return {
    /** Add an event to the buffer. Flushes automatically when full or on timer. */
    push(event) {
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
    flush
  };
}

// src/index.ts
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function extractSourceIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}
function extractToken(request) {
  try {
    const url = new URL(request.url);
    const param = url.searchParams.get("_lq");
    if (param) return param;
  } catch {
  }
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("License ")) {
    const token = auth.slice(8).trim();
    return token || null;
  }
  return null;
}
function createLiquadHandler(config) {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }
  const onError = config.onError ?? (() => {
  });
  const apiBaseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const rulesCache = createRulesCache(config);
  const events = createEventBuffer({
    apiKey: config.apiKey,
    apiBaseUrl,
    waitUntil: config.waitUntil,
    onError: config.onError
  });
  return async function handleRequest(request) {
    try {
      const rules = await rulesCache.getOrRefresh();
      if (!rules) {
        return { blocked: false };
      }
      const ua = request.headers.get("user-agent") ?? "";
      const agent = matchUserAgent(ua, rules.agents);
      if (!agent) {
        return { blocked: false };
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const host = request.headers.get("host") ?? "";
      const domain = host.replace(/:\d+$/, "");
      const ip = extractSourceIp(request);
      const declaredRanges = agent.declared_ips ?? [];
      if (declaredRanges.length > 0) {
        if (!ip || !isIpInRanges(ip, declaredRanges)) {
          events.push({
            domain,
            request_url: request.url,
            user_agent_name: agent.name,
            user_agent_raw: ua,
            matched_catalog_id: null,
            decision: "denied_identity_check",
            price_applied: null,
            consumer_workspace_id: null,
            timestamp,
            source_ip: ip,
            ic_verified: false
          });
          return {
            blocked: true,
            response: jsonResponse(403, {
              error: "bot_identity_unverified",
              message: "Request IP is not within the bot operator's declared ranges"
            })
          };
        }
      }
      const fullUrl = request.url.startsWith("http") ? request.url : `https://${domain}${request.url}`;
      const normalizedUrl = normalizeUrl(fullUrl) ?? fullUrl;
      if (rules.catalogs.length > 0 && agent.catalog_ids.length > 0) {
        const freeMatch = matchRequest({
          normalizedUrl,
          agentIds: [agent.id],
          agents: [agent],
          catalogs: rules.catalogs,
          maxPrice: 0
        });
        if (freeMatch.type === "matched") {
          events.push({
            domain,
            request_url: normalizedUrl,
            user_agent_name: agent.name,
            user_agent_raw: ua,
            matched_catalog_id: freeMatch.catalog_id,
            decision: "granted",
            price_applied: 0,
            consumer_workspace_id: null,
            timestamp,
            source_ip: ip
          });
          return { blocked: false };
        }
      }
      const token = extractToken(request);
      if (token) {
        const result = await verifyToken(token, normalizedUrl, rules.hmac_secret);
        if (result.valid) {
          events.push({
            domain,
            request_url: normalizedUrl,
            user_agent_name: agent.name,
            user_agent_raw: ua,
            matched_catalog_id: null,
            decision: "authorized_paid",
            price_applied: null,
            consumer_workspace_id: null,
            timestamp,
            source_ip: ip
          });
          return { blocked: false };
        }
        events.push({
          domain,
          request_url: normalizedUrl,
          user_agent_name: agent.name,
          user_agent_raw: ua,
          matched_catalog_id: null,
          decision: "denied_invalid_token",
          price_applied: null,
          consumer_workspace_id: null,
          timestamp,
          source_ip: ip
        });
        return {
          blocked: true,
          response: jsonResponse(403, {
            error: "invalid_token"
          })
        };
      }
      events.push({
        domain,
        request_url: normalizedUrl,
        user_agent_name: agent.name,
        user_agent_raw: ua,
        matched_catalog_id: null,
        decision: "denied_authorization_required",
        price_applied: null,
        consumer_workspace_id: null,
        timestamp,
        source_ip: ip
      });
      return {
        blocked: true,
        response: jsonResponse(403, {
          error: "grant_required",
          authorize_url: `${apiBaseUrl}/api/sdk/transaction`,
          content_url: normalizedUrl
        })
      };
    } catch (err) {
      onError(err instanceof Error ? err : new Error("Unknown SDK handler error"));
      return { blocked: false };
    }
  };
}
export {
  createLiquadHandler,
  matchRequest,
  matchUserAgent,
  normalizeUrl,
  toExpressMiddleware,
  verifyToken
};
