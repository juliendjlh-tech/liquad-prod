// ---------------------------------------------------------------------------
// Step 11: Log the query, sign bot-bound tokens, return final results
// ---------------------------------------------------------------------------

import type { PipelineStep, QueryResultItem } from "../types";
import { logQuery } from "../helpers";
import { getWorkspaceSecret } from "@/lib/db/queries/workspaces";

// ---------------------------------------------------------------------------
// HMAC helpers (same logic as consumer.service.ts)
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
// Step
// ---------------------------------------------------------------------------

/**
 * Log the query to rag_query_logs, sign bot-bound HMAC tokens for each
 * result, and return the final response.
 */
export const logAndReturn: PipelineStep = async (ctx) => {
  const {
    supabase, consumerWorkspaceId, accumulated, totalCost,
    input, searchConfigId, uaPattern, _grants,
  } = ctx;

  // Build structured log results for traceability
  const logResults = accumulated!.map((r) => ({
    source_url: r.source_url,
    catalog_id: r.catalog_id,
    price_eur: Number(r.price_eur),
    score: Math.round((1 - r.distance) * 10000) / 10000,
  }));

  await logQuery(supabase, consumerWorkspaceId!, input, searchConfigId ?? null, totalCost!, logResults);

  // Build grant lookup by URL
  const grantByUrl = new Map(
    (_grants ?? []).map((g) => [g.url, g])
  );

  // Fetch HMAC secrets for involved publishers and sign tokens
  const uniquePublisherIds = [...new Set(accumulated!.map((r) => r.publisher_workspace_id))];
  const hmacKeyMap = new Map<string, CryptoKey>();

  await Promise.all(
    uniquePublisherIds.map(async (pubId) => {
      const secret = await getWorkspaceSecret(pubId);
      const key = await importHmacKey(secret);
      hmacKeyMap.set(pubId, key);
    })
  );

  // Build consumer-facing results with signed tokens
  const finalResults: QueryResultItem[] = await Promise.all(
    accumulated!.map(async (r) => {
      const grant = grantByUrl.get(r.source_url)!;
      const expiryUnix = Math.floor(new Date(grant.expires_at).getTime() / 1000);
      const hmacKey = hmacKeyMap.get(r.publisher_workspace_id)!;

      const token = await signHmacToken(
        hmacKey,
        grant.grant_id,
        uaPattern!,
        r.source_url,
        expiryUnix
      );

      return {
        url: r.source_url,
        token,
        catalog_id: r.catalog_id,
        catalog_name: r.catalog_name,
        price_eur: Number(r.price_eur),
        score: Math.round((1 - r.distance) * 10000) / 10000,
        expires_at: grant.expires_at,
        cached: grant.cached,
        snippet: r.chunk_text,
        heading_context: r.heading_context,
      };
    })
  );

  return {
    results: finalResults,
    total_cost_eur: Math.round(totalCost! * 10000) / 10000,
    balance_remaining_eur: ctx._newBalance!,
  };
};
