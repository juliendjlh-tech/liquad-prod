import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/services/auth.service";
import { ingestEvents } from "@/lib/services/sdk.service";
import { sdkEventBatchSchema } from "@/lib/validations/sdk-event.schema";

/**
 * POST /api/sdk/events
 *
 * Ingest a batch of SDK access events for a workspace.
 *
 * Authentication: API key via Authorization: Bearer <key>
 * NOT protected by session middleware (bypassed in middleware.ts).
 *
 * Partial acceptance: valid events are stored, invalid events are
 * counted as rejected. The entire batch is not rejected for one bad event.
 *
 * After ingestion, domain verification is checked for each unique domain.
 *
 * REQUEST BODY (JSON):
 * ```json
 * { "events": [{ domain, request_url, decision, timestamp, ... }] }
 * ```
 *
 * RESPONSES:
 * - 200: `{ accepted, rejected }`
 * - 400: Validation error or batch too large
 * - 401: Invalid/missing API key
 * - 500: Internal server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await authenticateApiKey(authHeader);

    if ("error" in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = sdkEventBatchSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const result = await ingestEvents(
      authResult.workspaceId,
      validation.data.events
    );

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
