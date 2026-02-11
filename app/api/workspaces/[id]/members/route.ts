import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { inviteMemberSchema } from "@/lib/validations/member.schema";
import {
  getWorkspaceMembers,
  inviteMember,
} from "@/lib/services/workspace.service";

/**
 * GET /api/workspaces/:id/members
 *
 * List all members of a workspace with their email and role.
 * Any workspace member (owner, admin, or member) can call this endpoint.
 *
 * RESPONSE:
 * - 200: Array of `{ user_id, email, role, invited_at, accepted_at }`
 *   Members are ordered by invited_at ASC (oldest first, owner at top).
 * - 401: Unauthorized
 * - 404: Workspace not found or user is not a member
 * - 500: Internal server error
 *
 * NON-MEMBER BEHAVIOR:
 * Returns 404 (not 403) to prevent leaking workspace existence.
 *
 * @see {@link getWorkspaceMembers} for the service layer implementation
 */
export async function GET(
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

    const members = await getWorkspaceMembers(workspaceId, user.id);

    return NextResponse.json(members, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_MEMBER") {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/:id/members
 *
 * Invite a new member to the workspace by email.
 * Only owner or admin can invite.
 *
 * MVP simplification: invitations are auto-accepted (no email flow).
 * The invited user is immediately added as a member.
 *
 * REQUEST BODY (JSON):
 * ```json
 * { "email": "teammate@example.com", "role": "admin" }
 * ```
 * - email: Required, valid email format.
 * - role: Optional, defaults to "member". Must be "admin" or "member".
 *   "owner" cannot be assigned via invite.
 *
 * RESPONSE:
 * - 201: `{ user_id, role, invited_at }` — member added
 * - 400: Validation error (invalid email, invalid role)
 * - 401: Unauthorized
 * - 403: Insufficient permissions (caller is a regular member)
 * - 404: Workspace not found / user not a member / email not registered
 * - 409: User is already a member of this workspace
 * - 500: Internal server error
 *
 * @see {@link inviteMember} for the service layer implementation
 * @see {@link inviteMemberSchema} for validation rules
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId } = await params;

    // Validate request body
    const body = await request.json();
    const validation = inviteMemberSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, role } = validation.data;
    const member = await inviteMember(workspaceId, user.id, email, role);

    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_MEMBER") {
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 404 }
        );
      }
      if (err.message === "FORBIDDEN") {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }
      if (err.message === "USER_NOT_FOUND") {
        return NextResponse.json(
          { error: "No user found with this email" },
          { status: 404 }
        );
      }
      if (err.message === "ALREADY_MEMBER") {
        return NextResponse.json(
          { error: "User is already a member of this workspace" },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
