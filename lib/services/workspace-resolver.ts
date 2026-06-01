import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { isPublicId } from "@/lib/ids";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a workspace identifier (UUID or `wks_xxx` public_id) to the
 * internal UUID. UUIDs are passed through unchanged (no DB round-trip) so
 * downstream queries 404 naturally if they don't exist.
 *
 * Returns null if the input is missing, malformed, or no workspace matches
 * the public_id.
 */
export async function resolveWorkspaceId(
  value: string | null | undefined
): Promise<string | null> {
  if (!value) return null;
  if (UUID_RE.test(value)) return value;
  if (!isPublicId(value, "wks")) return null;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("public_id", value)
    .single();

  return data?.id ?? null;
}

type ResourceTable =
  | "bots"
  | "catalogs"
  | "domains"
  | "subscriptions"
  | "api_keys";

/**
 * Resolve a resource identifier (UUID or `<prefix>_xxx` public_id) to the
 * internal UUID for the given table. UUIDs pass through unchanged.
 *
 * Returns null when the input is missing, malformed, or no row matches.
 */
export async function resolveResourceId(
  table: ResourceTable,
  value: string | null | undefined
): Promise<string | null> {
  if (!value) return null;
  if (UUID_RE.test(value)) return value;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("public_id", value)
    .single();

  return data?.id ?? null;
}

export type WorkspaceMembership = {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "member";
};

export type RequireWorkspaceMembershipResult =
  | { ok: true; workspace: WorkspaceMembership }
  | { ok: false; response: NextResponse };

/**
 * Resolve a workspace ID from a route param (public_id or UUID) and verify
 * the current user is a member. Use at the top of every
 * `/api/internal/workspaces/[workspaceId]/...` handler.
 *
 * Returns 404 (not 403) for non-members to avoid leaking workspace existence.
 */
export async function requireWorkspaceMembership(
  workspaceIdParam: string
): Promise<RequireWorkspaceMembershipResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const workspaceId = await resolveWorkspaceId(workspaceIdParam);
  if (!workspaceId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      ),
    };
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      ),
    };
  }

  return {
    ok: true,
    workspace: {
      userId: user.id,
      workspaceId,
      role: membership.role as "owner" | "admin" | "member",
    },
  };
}
