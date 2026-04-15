import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/services/auth.service";
import { getGatewayRules } from "@/lib/services/sdk.service";

/**
 * GET /api/sdk/rules
 *
 * Fetch licensing rules for the authenticated workspace.
 * Used by the deployed SDK to make local decisions.
 *
 * Authentication: API key via Authorization: Bearer <key>
 * NOT protected by session middleware (bypassed in middleware.ts).
 *
 * Returns only:
 * - Verified domains
 * - Active user-agents
 * - Active catalogs (ordered by created_at ASC — first match wins)
 *
 * RESPONSE HEADERS:
 * - Cache-Control: private, max-age=300 (5 minutes)
 *
 * RESPONSES:
 * - 200: WorkspaceRules object
 * - 401: Invalid/missing API key
 * - 500: Internal server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await authenticateApiKey(authHeader);

    if ("error" in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: 401 }
      );
    }

    const rules = await getGatewayRules(authResult.workspaceId);

    const response = NextResponse.json(rules, { status: 200 });
    response.headers.set("Cache-Control", "private, max-age=300");

    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
