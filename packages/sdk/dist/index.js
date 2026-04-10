"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createLiquadHandler: () => createLiquadHandler,
  matchRequest: () => matchRequest,
  matchUserAgent: () => matchUserAgent,
  normalizeUrl: () => normalizeUrl,
  toExpressMiddleware: () => toExpressMiddleware,
  verifyToken: () => verifyToken
});
module.exports = __toCommonJS(index_exports);

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

// src/matcher.ts
function evaluatePathRule(pathname, rule) {
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
function matchFilterRules(requestDomain, requestPath, filterRules) {
  const matchingRules = filterRules.domain_rules.filter(
    (r) => r.domain === requestDomain
  );
  if (matchingRules.length === 0) return false;
  for (const rule of matchingRules) {
    if (!rule.path_rules || rule.path_rules.length === 0) return true;
    const logic = rule.path_logic ?? "AND";
    const matches = logic === "AND" ? rule.path_rules.every((pr) => evaluatePathRule(requestPath, pr)) : rule.path_rules.some((pr) => evaluatePathRule(requestPath, pr));
    if (matches) return true;
  }
  return false;
}
function matchUserAgent(userAgentString, agents) {
  if (!userAgentString) return null;
  const uaLower = userAgentString.toLowerCase();
  for (const agent of agents) {
    if (uaLower.includes(agent.ua_pattern.toLowerCase())) {
      return agent;
    }
  }
  return null;
}
function findBestCatalog(catalogs, agentCatalogIds, domain, requestPath, maxPrice) {
  const allowedIds = new Set(agentCatalogIds);
  const matching = catalogs.filter(
    (catalog) => allowedIds.has(catalog.id) && (maxPrice === void 0 || catalog.price_eur <= maxPrice) && matchFilterRules(domain, requestPath, catalog.filter_rules)
  ).sort((a, b) => a.price_eur - b.price_eur);
  return matching[0] ?? null;
}
function matchRequest(input) {
  const { normalizedUrl, agents, catalogs, maxPrice } = input;
  let domain;
  let requestPath;
  try {
    const urlObj = new URL(normalizedUrl);
    domain = urlObj.hostname;
    requestPath = urlObj.pathname;
  } catch {
    return { type: "no_match" };
  }
  let targetAgents;
  if (input.agentIds) {
    const idSet = new Set(input.agentIds);
    targetAgents = agents.filter((a) => idSet.has(a.id));
  } else {
    const matched = matchUserAgent(input.userAgent, agents);
    targetAgents = matched ? [matched] : [];
  }
  if (targetAgents.length === 0) {
    return { type: "no_match" };
  }
  let bestResult = null;
  for (const agent of targetAgents) {
    const catalog = findBestCatalog(
      catalogs,
      agent.catalog_ids,
      domain,
      requestPath,
      maxPrice
    );
    if (catalog && (!bestResult || catalog.price_eur < bestResult.catalog.price_eur)) {
      bestResult = { agent, catalog };
    }
  }
  if (!bestResult) {
    return {
      type: "no_catalog",
      agent_id: targetAgents[0].id,
      agent_name: targetAgents[0].name
    };
  }
  return {
    type: "matched",
    catalog_id: bestResult.catalog.id,
    agent_id: bestResult.agent.id,
    agent_name: bestResult.agent.name,
    price_eur: bestResult.catalog.price_eur
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

// src/url-normalize.ts
function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${url.protocol}//${url.hostname}${path}`;
  } catch {
    return null;
  }
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

// src/express.ts
function toExpressMiddleware(handler) {
  return async (req, res, next) => {
    try {
      const proto = req.headers["x-forwarded-proto"] ?? "http";
      const host = req.headers.host ?? "localhost";
      const url = `${proto}://${host}${req.url}`;
      const webReq = new Request(url, {
        method: req.method,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(([, v]) => v !== void 0).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v])
        )
      });
      const result = await handler(webReq);
      if (result.blocked && result.response) {
        const headers = {};
        result.response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        res.writeHead(result.response.status, headers);
        res.end(await result.response.text());
      } else {
        next();
      }
    } catch {
      next();
    }
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createLiquadHandler,
  matchRequest,
  matchUserAgent,
  normalizeUrl,
  toExpressMiddleware,
  verifyToken
});
