/**
 * HMAC Token Verification — local, zero-network verification
 *
 * Verifies HMAC-SHA256 signed tokens using Web Crypto API.
 * Works on Node 18+, Cloudflare Workers, Deno, Vercel Edge.
 *
 * Token format: base64url( grantId.uaPattern.expiryUnix.hmacSignatureHex )
 * HMAC message: grantId + "." + uaPattern + "." + normalizedUrl + "." + expiryUnix
 *
 * The URL is NOT in the token — reconstructed from the request.
 * The uaPattern binds the token to a specific bot identity.
 *
 * Parsing strategy (option A): parse from the edges.
 *   - First segment  = grantId (UUID)
 *   - Last segment   = sigHex (64 hex chars)
 *   - Second to last = expiryUnix (number)
 *   - Everything between = uaPattern (may contain dots)
 */

// CryptoKey cache — avoids reimporting on every request
let cachedSecret: string | null = null;
let cachedKey: CryptoKey | null = null;

export interface TokenVerifyResult {
  valid: boolean;
  grantId?: string;
  uaPattern?: string;
}

/**
 * Verify an HMAC-signed access token.
 *
 * @param token            - Base64url-encoded token from ?_lq= param or Authorization header
 * @param normalizedUrl    - The normalized URL being requested (used to reconstruct HMAC message)
 * @param expectedUaPattern - The ua_pattern of the agent matched by the gateway (must match token)
 * @param secret           - Publisher's HMAC secret (base64-encoded, from workspace rules)
 * @param nowMs            - Current time in ms (optional, for testing)
 */
export async function verifyToken(
  token: string,
  normalizedUrl: string,
  expectedUaPattern: string,
  secret: string,
  nowMs?: number
): Promise<TokenVerifyResult> {
  // 1. Base64url decode
  let decoded: string;
  try {
    decoded = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return { valid: false };
  }

  // 2. Parse from the edges: grantId.uaPattern.expiryUnix.sigHex
  //    sigHex = 64 hex chars, expiryUnix = numeric, grantId = UUID
  //    uaPattern = everything between first dot and second-to-last dot
  const firstDot = decoded.indexOf(".");
  if (firstDot === -1) return { valid: false };

  const lastDot = decoded.lastIndexOf(".");
  if (lastDot === -1 || lastDot === firstDot) return { valid: false };

  const secondToLastDot = decoded.lastIndexOf(".", lastDot - 1);
  if (secondToLastDot === -1 || secondToLastDot <= firstDot) return { valid: false };

  const grantId = decoded.slice(0, firstDot);
  const uaPattern = decoded.slice(firstDot + 1, secondToLastDot);
  const expiryStr = decoded.slice(secondToLastDot + 1, lastDot);
  const sigHex = decoded.slice(lastDot + 1);

  if (!grantId || !uaPattern || !expiryStr || !sigHex) return { valid: false };

  // 3. Verify bot identity — token's ua_pattern must match the requesting agent
  if (uaPattern !== expectedUaPattern) return { valid: false };

  // 4. Check expiry
  const expiryUnix = parseInt(expiryStr, 10);
  if (isNaN(expiryUnix)) return { valid: false };
  const expiryMs = expiryUnix * 1000;
  if ((nowMs ?? Date.now()) >= expiryMs) return { valid: false };

  // 5. Import key (cached per secret string)
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

  // 6. Reconstruct message and verify HMAC
  const message = `${grantId}.${uaPattern}.${normalizedUrl}.${expiryStr}`;
  const hexPairs = sigHex.match(/.{2}/g);
  if (!hexPairs || hexPairs.length !== 32) return { valid: false };
  const sigBytes = new Uint8Array(hexPairs.map((h) => parseInt(h, 16)));

  const valid = await crypto.subtle.verify(
    "HMAC",
    cachedKey,
    sigBytes,
    new TextEncoder().encode(message)
  );

  return valid ? { valid: true, grantId, uaPattern } : { valid: false };
}
