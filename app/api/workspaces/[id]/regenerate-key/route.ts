import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { regenerateApiKey } from "@/lib/services/workspace.service";

/**
 * POST /api/workspaces/:id/regenerate-key
 *
 * Regenerate the API key for a workspace. The old key is immediately
 * invalidated — any SDK using it will receive 401 on the next request.
 *
 * AUTHORIZATION: Owner only.
 * Admins and members receive 403. This is intentional because key
 * regeneration breaks live SDK deployments and should only be done
 * by the workspace owner.
 *
 * NO REQUEST BODY required.
 *
 * FLOW:
 * 1. Get the authenticated user from the session.
 * 2. Call regenerateApiKey(workspaceId, userId) which:
 *    - Verifies membership and owner role
 *    - Generates a new key, hashes it, overwrites the old hash
 * 3. Return the new plaintext API key (shown once).
 *
 * RESPONSES:
 * - 200: `{ api_key: "df_..." }` — new plaintext key (shown once)
 * - 401: Unauthorized (handled by middleware)
 * - 403: `{ error: "Only the workspace owner can regenerate the API key" }`
 * - 404: `{ error: "Workspace not found" }` (workspace doesn't exist or user is not a member)
 * - 500: Internal server error
 *
 * @see {@link regenerateApiKey} for the service layer implementation
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const newApiKey = await regenerateApiKey(workspaceId, user.id);

    return NextResponse.json({ api_key: newApiKey }, { status: 200 });
  } catch (err) {
    // Map service layer error codes to HTTP status codes.
    // The service throws typed errors (NOT_MEMBER, FORBIDDEN, UPDATE_FAILED)
    // which we translate to appropriate HTTP responses.
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 404 }
        );
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json(
          { error: "Only the workspace owner can regenerate the API key" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
