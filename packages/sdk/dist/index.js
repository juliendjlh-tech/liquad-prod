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
  toExpressMiddleware: () => toExpressMiddleware
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
    /**
     * Get rules from cache, or fetch them if stale/missing.
     * This is the only way to access rules — no separate start() needed.
     */
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
    },
    getJwtSecret() {
      return rules?.jwt_signing_secret ?? null;
    },
    getIdentityCheckConfig() {
      return rules?.identity_check ?? null;
    }
  };
}

// src/matcher.ts
function matchUserAgent(userAgentString, declaredAgents) {
  if (!userAgentString) return null;
  const uaLower = userAgentString.toLowerCase();
  for (const agent of declaredAgents) {
    if (uaLower.includes(agent.ua_pattern.toLowerCase())) {
      return agent;
    }
  }
  return null;
}
function matchUrlPatterns(requestPath, urlPatterns) {
  for (const pattern of urlPatterns) {
    try {
      const regex = new RegExp(pattern);
      if (regex.test(requestPath)) {
        return true;
      }
    } catch {
    }
  }
  return false;
}
function matchRequest(rules, request, defaultPrice) {
  const { url, host, userAgent } = request;
  const domain = host.replace(/:\d+$/, "");
  if (!rules.verified_domains.includes(domain)) {
    return { type: "passthrough" };
  }
  const matchedAgent = matchUserAgent(userAgent, rules.user_agents);
  if (!matchedAgent) {
    return { type: "passthrough" };
  }
  let requestPath;
  try {
    requestPath = new URL(url).pathname;
  } catch {
    requestPath = url.startsWith("/") ? url : `/${url}`;
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const requestUrl = url.startsWith("http") ? url : `https://${domain}${requestPath}`;
  for (const catalog of rules.catalogs) {
    if (!catalog.agent_ids.includes(matchedAgent.id)) {
      continue;
    }
    if (!matchUrlPatterns(requestPath, catalog.url_patterns)) {
      continue;
    }
    const event = {
      domain,
      request_url: requestUrl,
      user_agent_name: matchedAgent.name,
      user_agent_raw: userAgent,
      matched_catalog_id: catalog.id,
      decision: catalog.price_eur <= defaultPrice ? "granted" : "denied",
      price_applied: catalog.price_eur,
      consumer_workspace_id: null,
      timestamp
    };
    if (catalog.price_eur <= defaultPrice) {
      return {
        type: "granted",
        catalogId: catalog.id,
        price: catalog.price_eur,
        event
      };
    }
    return {
      type: "denied",
      catalogId: catalog.id,
      price: catalog.price_eur,
      responseBody: {
        status: "licensing_required",
        content: { source_url: requestUrl },
        licensing: {
          catalog_id: catalog.id,
          price_eur: catalog.price_eur,
          currency: "EUR"
        }
      },
      event
    };
  }
  return {
    type: "blocked_no_catalog",
    event: {
      domain,
      request_url: requestUrl,
      user_agent_name: matchedAgent.name,
      user_agent_raw: userAgent,
      matched_catalog_id: null,
      decision: "blocked_no_catalog",
      price_applied: null,
      consumer_workspace_id: null,
      timestamp
    }
  };
}

// src/identity-check.ts
var DEFAULT_CACHE_TTL_MS = 36e5;
var DEFAULT_DNS_TIMEOUT_MS = 500;
var MAX_CACHE_ENTRIES = 1e4;
var DOH_RESOLVER = "https://cloudflare-dns.com/dns-query";
function matchDnsPattern(hostname, pattern) {
  try {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".+");
    const regex = new RegExp(`^${escaped}$`, "i");
    return regex.test(hostname);
  } catch {
    return false;
  }
}
function matchAnyDnsPattern(hostname, patterns) {
  return patterns.some((pattern) => matchDnsPattern(hostname, pattern));
}
function ipToArpa(ip) {
  return ip.split(".").reverse().join(".") + ".in-addr.arpa";
}
async function reverseDns(ip, timeoutMs) {
  const resp = await fetch(
    `${DOH_RESOLVER}?name=${ipToArpa(ip)}&type=PTR`,
    {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs)
    }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.Answer ?? []).filter((a) => a.type === 12).map((a) => a.data.replace(/\.$/, ""));
}
async function forwardDns(hostname, timeoutMs) {
  const resp = await fetch(
    `${DOH_RESOLVER}?name=${hostname}&type=A`,
    {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs)
    }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
}
function createIdentityChecker(config = {}) {
  const cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const dnsTimeoutMs = config.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  const onError = config.onError ?? (() => {
  });
  const cache = /* @__PURE__ */ new Map();
  function evictIfOverCapacity() {
    if (cache.size <= MAX_CACHE_ENTRIES) return;
    const entriesToRemove = cache.size - MAX_CACHE_ENTRIES;
    const keysToDelete = [];
    let count = 0;
    for (const key of cache.keys()) {
      if (count >= entriesToRemove) break;
      keysToDelete.push(key);
      count++;
    }
    for (const key of keysToDelete) {
      cache.delete(key);
    }
  }
  async function verify(ip, botId, dnsPatterns) {
    const startTime = Date.now();
    try {
      const cacheKey = `${ip}:${botId}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.checkedAt <= cacheTtlMs) {
        return {
          ...cached.result,
          cached: true,
          durationMs: Date.now() - startTime
        };
      }
      let hostnames;
      try {
        hostnames = await reverseDns(ip, dnsTimeoutMs);
      } catch (err) {
        onError(
          err instanceof Error ? err : new Error(`rDNS failed for ${ip}`)
        );
        const failResult = {
          verified: false,
          hostname: null,
          durationMs: Date.now() - startTime,
          cached: false
        };
        cache.set(cacheKey, { result: failResult, checkedAt: Date.now() });
        evictIfOverCapacity();
        return failResult;
      }
      if (hostnames.length === 0) {
        const failResult = {
          verified: false,
          hostname: null,
          durationMs: Date.now() - startTime,
          cached: false
        };
        cache.set(cacheKey, { result: failResult, checkedAt: Date.now() });
        evictIfOverCapacity();
        return failResult;
      }
      const hostname = hostnames[0];
      if (!matchAnyDnsPattern(hostname, dnsPatterns)) {
        const failResult = {
          verified: false,
          hostname,
          durationMs: Date.now() - startTime,
          cached: false
        };
        cache.set(cacheKey, { result: failResult, checkedAt: Date.now() });
        evictIfOverCapacity();
        return failResult;
      }
      let resolvedIps;
      try {
        resolvedIps = await forwardDns(hostname, dnsTimeoutMs);
      } catch (err) {
        onError(
          err instanceof Error ? err : new Error(`fDNS failed for ${hostname}`)
        );
        const failResult = {
          verified: false,
          hostname,
          durationMs: Date.now() - startTime,
          cached: false
        };
        cache.set(cacheKey, { result: failResult, checkedAt: Date.now() });
        evictIfOverCapacity();
        return failResult;
      }
      const ipMatches = resolvedIps.includes(ip);
      const finalResult = {
        verified: ipMatches,
        hostname,
        durationMs: Date.now() - startTime,
        cached: false
      };
      cache.set(cacheKey, { result: finalResult, checkedAt: Date.now() });
      evictIfOverCapacity();
      return finalResult;
    } catch (err) {
      onError(
        err instanceof Error ? err : new Error("Unexpected error in identity check")
      );
      return {
        verified: false,
        hostname: null,
        durationMs: Date.now() - startTime,
        cached: false
      };
    }
  }
  return { verify };
}

// src/index.ts
var import_jose = require("jose");

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
function normalizeUrlForSdk(rawUrl) {
  try {
    const url = new URL(rawUrl);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${url.protocol}//${url.hostname}${path}`;
  } catch {
    return rawUrl;
  }
}
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
function sendEvent(config, event) {
  const url = `${config.apiBaseUrl ?? "https://liquad.app"}/api/sdk/events`;
  const promise = fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ events: [event] })
  }).catch((err) => {
    const onError = config.onError ?? (() => {
    });
    onError(
      err instanceof Error ? err : new Error("Event send error")
    );
  });
  if (config.waitUntil) {
    config.waitUntil(promise);
  }
}
function enrichEventWithIcMetadata(event, sourceIp, icResult) {
  if (!icResult) return event;
  return {
    ...event,
    source_ip: sourceIp,
    ic_verified: icResult.verified,
    ic_hostname: icResult.hostname,
    ic_duration_ms: icResult.durationMs
  };
}
function createLiquadHandler(config) {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }
  const defaultPrice = config.defaultPrice ?? 0;
  const onError = config.onError ?? (() => {
  });
  const apiBaseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const rulesCache = createRulesCache(config);
  const identityChecker = createIdentityChecker({ onError });
  async function performIdentityCheck(ip, botId, dnsPatterns) {
    if (!dnsPatterns || dnsPatterns.length === 0) return null;
    if (!ip) {
      return {
        verified: false,
        hostname: null,
        durationMs: 0,
        cached: false
      };
    }
    return identityChecker.verify(ip, botId, dnsPatterns);
  }
  return async function handleRequest(request) {
    try {
      const rules = await rulesCache.getOrRefresh();
      if (!rules) {
        return { blocked: false };
      }
      const host = request.headers.get("host") ?? "";
      const userAgent = request.headers.get("user-agent") ?? "";
      const requestUrl = new URL(request.url);
      const url = requestUrl.pathname + requestUrl.search;
      const sourceIp = extractSourceIp(request);
      const decision = matchRequest(
        rules,
        { url: request.url, host, userAgent },
        defaultPrice
      );
      switch (decision.type) {
        case "passthrough":
          return { blocked: false };
        case "granted": {
          const matchedAgent = rules.user_agents.find(
            (a) => a.name === decision.event.user_agent_name
          );
          const dnsPatterns = matchedAgent?.dns_patterns ?? [];
          try {
            const icResult = await performIdentityCheck(
              sourceIp,
              matchedAgent?.id ?? "",
              dnsPatterns
            );
            if (icResult && !icResult.verified) {
              sendEvent(
                config,
                enrichEventWithIcMetadata(
                  { ...decision.event, decision: "denied_identity_check" },
                  sourceIp,
                  icResult
                )
              );
              return {
                blocked: true,
                response: jsonResponse(403, {
                  error: "bot_identity_unverified",
                  message: "Bot identity could not be verified"
                })
              };
            }
            sendEvent(
              config,
              enrichEventWithIcMetadata(decision.event, sourceIp, icResult)
            );
            return { blocked: false };
          } catch (icErr) {
            onError(
              icErr instanceof Error ? icErr : new Error("Identity Check error")
            );
            sendEvent(config, decision.event);
            return { blocked: false };
          }
        }
        case "denied": {
          const authHeader = request.headers.get("authorization");
          if (authHeader && authHeader.startsWith("License ")) {
            const jwtSecret = rulesCache.getJwtSecret();
            if (jwtSecret) {
              try {
                const token = authHeader.slice(8);
                const secret = new TextEncoder().encode(jwtSecret);
                const { payload } = await (0, import_jose.jwtVerify)(token, secret, {
                  algorithms: ["HS256"]
                });
                const jwtPayload = payload;
                const domain = host.replace(/:\d+$/, "");
                const fullUrl = request.url.startsWith("http") ? request.url : `https://${domain}${url.startsWith("/") ? url : "/" + url}`;
                const normalizedRequestUrl = normalizeUrlForSdk(fullUrl);
                if (jwtPayload.pub !== rules.workspace_id) {
                  sendEvent(config, {
                    ...decision.event,
                    decision: "denied_invalid_token",
                    consumer_workspace_id: jwtPayload.sub ?? null
                  });
                  return {
                    blocked: true,
                    response: jsonResponse(402, {
                      error: "invalid_token",
                      reason: "invalid_publisher"
                    })
                  };
                }
                if (jwtPayload.url !== normalizedRequestUrl) {
                  sendEvent(config, {
                    ...decision.event,
                    decision: "denied_invalid_token",
                    consumer_workspace_id: jwtPayload.sub ?? null
                  });
                  return {
                    blocked: true,
                    response: jsonResponse(402, {
                      error: "invalid_token",
                      reason: "url_mismatch"
                    })
                  };
                }
                const matchedAgent = rules.user_agents.find(
                  (a) => a.name === decision.event.user_agent_name
                );
                const dnsPatterns = matchedAgent?.dns_patterns ?? [];
                try {
                  const icResult = await performIdentityCheck(
                    sourceIp,
                    matchedAgent?.id ?? "",
                    dnsPatterns
                  );
                  if (icResult && !icResult.verified) {
                    sendEvent(
                      config,
                      enrichEventWithIcMetadata(
                        {
                          ...decision.event,
                          decision: "denied_identity_check",
                          consumer_workspace_id: jwtPayload.sub
                        },
                        sourceIp,
                        icResult
                      )
                    );
                    return {
                      blocked: true,
                      response: jsonResponse(403, {
                        error: "bot_identity_unverified",
                        message: "Bot identity could not be verified"
                      })
                    };
                  }
                  sendEvent(
                    config,
                    enrichEventWithIcMetadata(
                      {
                        ...decision.event,
                        decision: "authorized_paid",
                        consumer_workspace_id: jwtPayload.sub
                      },
                      sourceIp,
                      icResult
                    )
                  );
                  return { blocked: false };
                } catch (icErr) {
                  onError(
                    icErr instanceof Error ? icErr : new Error("Identity Check error")
                  );
                  sendEvent(config, {
                    ...decision.event,
                    decision: "authorized_paid",
                    consumer_workspace_id: jwtPayload.sub
                  });
                  return { blocked: false };
                }
              } catch (jwtErr) {
                const reason = jwtErr instanceof Error && jwtErr.message.includes("expired") ? "token_expired" : "invalid_token";
                sendEvent(config, {
                  ...decision.event,
                  decision: "denied_invalid_token",
                  consumer_workspace_id: null
                });
                return {
                  blocked: true,
                  response: jsonResponse(402, {
                    error: "invalid_token",
                    reason
                  })
                };
              }
            }
          }
          sendEvent(config, {
            ...decision.event,
            decision: "denied_authorization_required",
            consumer_workspace_id: null
          });
          return {
            blocked: true,
            response: jsonResponse(402, {
              error: "authorization_required",
              authorize_url: `${apiBaseUrl}/api/sdk/authorize`,
              content_url: decision.event.request_url,
              price_eur: decision.price
            })
          };
        }
        case "blocked_no_catalog": {
          sendEvent(config, decision.event);
          return {
            blocked: true,
            response: jsonResponse(403, { error: "Access denied" })
          };
        }
      }
    } catch (err) {
      onError(
        err instanceof Error ? err : new Error("Unknown SDK handler error")
      );
      return { blocked: false };
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createLiquadHandler,
  toExpressMiddleware
});
