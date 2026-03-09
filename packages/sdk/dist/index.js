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
  createLiquadMiddleware: () => createLiquadMiddleware
});
module.exports = __toCommonJS(index_exports);

// src/rules-cache.ts
var MIN_REFRESH_INTERVAL = 1e4;
function fetchRules(config) {
  const baseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const url = `${baseUrl}/api/sdk/rules`;
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === "https:" ? require("https") : require("http");
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json"
        },
        timeout: 1e4
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Rules fetch failed with status ${res.statusCode}`));
            return;
          }
          try {
            const data = JSON.parse(body);
            resolve(data);
          } catch {
            reject(new Error("Failed to parse rules response"));
          }
        });
      }
    );
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Rules fetch timed out"));
    });
    req.end();
  });
}
function createRulesCache(config) {
  let rules = null;
  let timer = null;
  const interval = Math.max(
    config.refreshInterval ?? 3e5,
    MIN_REFRESH_INTERVAL
  );
  const onError = config.onError ?? (() => {
  });
  async function doRefresh() {
    try {
      rules = await fetchRules(config);
    } catch (err) {
      onError(
        err instanceof Error ? err : new Error("Unknown error fetching rules")
      );
    }
  }
  return {
    async start() {
      await doRefresh();
      timer = setInterval(() => {
        void doRefresh();
      }, interval);
    },
    getRules() {
      return rules;
    },
    getJwtSecret() {
      return rules?.jwt_signing_secret ?? null;
    },
    async refresh() {
      await doRefresh();
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}

// src/event-buffer.ts
var MAX_BUFFER_CAPACITY = 1e4;
function sendEvents(config, events) {
  const baseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const url = `${baseUrl}/api/sdk/events`;
  const payload = JSON.stringify({ events });
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === "https:" ? require("https") : require("http");
    const req = mod.request(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 1e4
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Event send failed with status ${res.statusCode}`));
          }
        });
      }
    );
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Event send timed out"));
    });
    req.write(payload);
    req.end();
  });
}
function createEventBuffer(config) {
  const buffer = [];
  let timer = null;
  let flushing = false;
  const batchSize = config.batchSize ?? 100;
  const batchInterval = config.batchInterval ?? 3e4;
  const onError = config.onError ?? (() => {
  });
  async function doFlush() {
    if (buffer.length === 0 || flushing) return;
    flushing = true;
    const batch = buffer.splice(0, buffer.length);
    try {
      await sendEvents(config, batch);
    } catch (err) {
      buffer.unshift(...batch);
      onError(
        err instanceof Error ? err : new Error("Unknown error sending events")
      );
    } finally {
      flushing = false;
    }
  }
  return {
    start() {
      timer = setInterval(() => {
        void doFlush();
      }, batchInterval);
    },
    add(event) {
      if (buffer.length >= MAX_BUFFER_CAPACITY) {
        buffer.shift();
        onError(
          new Error(
            `Event buffer at max capacity (${MAX_BUFFER_CAPACITY}). Oldest event dropped.`
          )
        );
      }
      buffer.push(event);
      if (buffer.length >= batchSize) {
        void doFlush();
      }
    },
    async flush() {
      await doFlush();
    },
    async stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      await doFlush();
    },
    size() {
      return buffer.length;
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

// src/index.ts
var import_jose = require("jose");
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
function sendJsonResponse(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json)
  });
  res.end(json);
}
function createLiquadMiddleware(config) {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }
  const defaultPrice = config.defaultPrice ?? 0;
  const onError = config.onError ?? (() => {
  });
  const apiBaseUrl = config.apiBaseUrl ?? "https://liquad.app";
  const rulesCache = createRulesCache(config);
  const eventBuffer = createEventBuffer(config);
  void rulesCache.start();
  eventBuffer.start();
  async function handleRequest(req, res, next) {
    try {
      const rules = rulesCache.getRules();
      if (!rules) {
        next();
        return;
      }
      const host = req.headers.host ?? "";
      const userAgent = req.headers["user-agent"] ?? "";
      const url = req.url ?? "/";
      const decision = matchRequest(
        rules,
        { url, host, userAgent },
        defaultPrice
      );
      switch (decision.type) {
        case "passthrough":
          next();
          break;
        case "granted":
          eventBuffer.add(decision.event);
          next();
          break;
        case "denied": {
          const authHeader = req.headers["authorization"];
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
                const requestUrl = url.startsWith("http") ? url : `https://${domain}${url.startsWith("/") ? url : "/" + url}`;
                const normalizedRequestUrl = normalizeUrlForSdk(requestUrl);
                if (jwtPayload.pub !== rules.workspace_id) {
                  sendJsonResponse(res, 402, {
                    error: "invalid_token",
                    reason: "invalid_publisher"
                  });
                  eventBuffer.add({
                    ...decision.event,
                    decision: "denied_invalid_token",
                    consumer_workspace_id: jwtPayload.sub ?? null
                  });
                  return;
                }
                if (jwtPayload.url !== normalizedRequestUrl) {
                  sendJsonResponse(res, 402, {
                    error: "invalid_token",
                    reason: "url_mismatch"
                  });
                  eventBuffer.add({
                    ...decision.event,
                    decision: "denied_invalid_token",
                    consumer_workspace_id: jwtPayload.sub ?? null
                  });
                  return;
                }
                eventBuffer.add({
                  ...decision.event,
                  decision: "authorized_paid",
                  consumer_workspace_id: jwtPayload.sub
                });
                next();
                return;
              } catch (jwtErr) {
                const reason = jwtErr instanceof Error && jwtErr.message.includes("expired") ? "token_expired" : "invalid_token";
                sendJsonResponse(res, 402, {
                  error: "invalid_token",
                  reason
                });
                eventBuffer.add({
                  ...decision.event,
                  decision: "denied_invalid_token",
                  consumer_workspace_id: null
                });
                return;
              }
            }
          }
          const deniedEvent = {
            ...decision.event,
            decision: "denied_authorization_required",
            consumer_workspace_id: null
          };
          sendJsonResponse(res, 402, {
            error: "authorization_required",
            authorize_url: `${apiBaseUrl}/api/sdk/authorize`,
            content_url: decision.event.request_url,
            price_eur: decision.price
          });
          eventBuffer.add(deniedEvent);
          break;
        }
        case "blocked_no_catalog": {
          const errorBody = JSON.stringify({ error: "Access denied" });
          res.writeHead(403, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(errorBody)
          });
          res.end(errorBody);
          eventBuffer.add(decision.event);
          break;
        }
      }
    } catch (err) {
      onError(
        err instanceof Error ? err : new Error("Unknown SDK middleware error")
      );
      next();
    }
  }
  const middleware = (req, res, next) => {
    void handleRequest(req, res, next);
  };
  middleware.destroy = async () => {
    rulesCache.stop();
    await eventBuffer.stop();
  };
  return middleware;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createLiquadMiddleware
});
