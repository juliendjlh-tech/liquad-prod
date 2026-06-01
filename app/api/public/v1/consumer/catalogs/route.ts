import { NextRequest, NextResponse } from "next/server";
import { authenticateConsumerKey } from "@/lib/services/auth.service";
import { listAccessibleCatalogs } from "@/lib/services/consumer.service";

/**
 * GET /api/public/v1/consumer/catalogs
 *
 * Discovery endpoint. List the catalogues the caller's API key can reach
 * (network's accepted catalogues whose bot allowlist matches the key's bot).
 *
 * Authentication: API key via Authorization: Bearer <key>. bot_id and network
 * are no longer URL params — both come from the key.
 *
 * RESPONSE (200): { catalogs: [...] }
 *
 * ERRORS:
 * - 401: invalid API key
 * - 422: bot missing IPs
 * - 500: internal error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await authenticateConsumerKey(
      request.headers.get("authorization")
    );
    if ("error" in authResult) {
      return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
    }

    const result = await listAccessibleCatalogs(
      authResult.workspaceId,
      authResult.accessSettingsId,
      authResult.botId,
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.details ? { details: result.details } : {}) },
        { status: result.status }
      );
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
