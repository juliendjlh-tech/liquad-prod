import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { createWorkspaceSchema } from "@/lib/validations/workspace.schema";
import {
  createWorkspace,
  getUserWorkspaces,
} from "@/lib/services/workspace.service";

/**
 * GET /api/internal/workspaces
 *
 * List all workspaces the authenticated user belongs to.
 * Returns each workspace with the user's role (owner, admin, or member).
 *
 * The API key is NEVER included in list responses for security.
 * The only time an API key is visible is at workspace creation (POST).
 *
 * RESPONSE:
 * - 200: Array of `{ id, name, role, created_at }`
 * - 401: Unauthorized (handled by middleware)
 * - 500: Internal server error
 *
 * @see {@link getUserWorkspaces} for the service layer implementation
 */
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Auth is enforced by middleware, but double-check as defense-in-depth
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaces = await getUserWorkspaces(user.id);
    return NextResponse.json(workspaces, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/workspaces
 *
 * Create a new workspace with the authenticated user as owner.
 * Generates a unique API key and returns it in plaintext (shown only once).
 *
 * REQUEST BODY (JSON):
 * ```json
 * { "name": "Acme Publishing" }
 * ```
 *
 * FLOW:
 * 1. Validate the request body using createWorkspaceSchema.
 * 2. Get the authenticated user from the session.
 * 3. Call createWorkspace() which:
 *    - Generates a random API key (lq_ prefix)
 *    - Hashes it with scrypt for storage
 *    - Creates the workspace record
 *    - Adds the user as owner in workspace_members
 * 4. Return the workspace data WITH the plaintext API key.
 *
 * RESPONSE:
 * - 201: `{ id, name, api_key, created_at }`
 *   The api_key field contains the plaintext key — this is the ONLY time
 *   it will be shown. The client must store/display it immediately.
 * - 400: Validation error (missing or empty name)
 * - 401: Unauthorized (handled by middleware)
 * - 500: Internal server error
 *
 * @see {@link createWorkspace} for the service layer implementation
 * @see {@link createWorkspaceSchema} for validation rules
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1: Validate the request body
    const body = await request.json();
    const validation = createWorkspaceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    // Step 2: Get the authenticated user
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 3-4: Create workspace and return with plaintext API key
    const workspace = await createWorkspace(user.id, validation.data.name);

    return NextResponse.json(workspace, { status: 201 });
  } catch (err) {
    console.error("POST /api/internal/workspaces error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
