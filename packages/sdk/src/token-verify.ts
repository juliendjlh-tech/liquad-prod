/**
 * HMAC Token Verification — local, zero-network verification
 *
 * Verifies HMAC-SHA256 signed tokens using Web Crypto API.
 * Works on Node 18+, Cloudflare Workers, Deno, Vercel Edge.
 *
 * Token format: base64url( grantId.expiryUnix.hmacSignatureHex )
 * HMAC message: grantId + "." + normalizedUrl + "." + expiryUnix
 *
 * The URL is NOT in the token — reconstructed from the request.
 * This binds each token to a specific URL (prevents cross-URL reuse).
 */

// CryptoKey cache — avoids reimporting on every request
let cachedSecret: string | null = null;
let cachedKey: CryptoKey | null = null;

export interface TokenVerifyResult {
  valid: boolean;
  grantId?: string;
}

/**
 * Verify an HMAC-signed access token.
 *
 * @param token         - Base64url-encoded token from ?_lq= param or Authorization header
 * @param normalizedUrl - The normalized URL being requested (used to reconstruct HMAC message)
 * @param secret        - Publisher's HMAC secret (base64-encoded, from workspace rules)
 * @param nowMs         - Current time in ms (optional, for testing)
 */
export async function verifyToken(
  token: string,
  normalizedUrl: string,
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

  // 2. Parse components: grantId.expiryUnix.sigHex
  const dotIdx1 = decoded.indexOf(".");
  const dotIdx2 = decoded.indexOf(".", dotIdx1 + 1);
  if (dotIdx1 === -1 || dotIdx2 === -1) return { valid: false };

  const grantId = decoded.slice(0, dotIdx1);
  const expiryStr = decoded.slice(dotIdx1 + 1, dotIdx2);
  const sigHex = decoded.slice(dotIdx2 + 1);

  if (!grantId || !expiryStr || !sigHex) return { valid: false };

  // 3. Check expiry
  const expiryUnix = parseInt(expiryStr, 10);
  if (isNaN(expiryUnix)) return { valid: false };
  const expiryMs = expiryUnix * 1000;
  if ((nowMs ?? Date.now()) >= expiryMs) return { valid: false };

  // 4. Import key (cached per secret string)
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

  // 5. Reconstruct message and verify HMAC
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
