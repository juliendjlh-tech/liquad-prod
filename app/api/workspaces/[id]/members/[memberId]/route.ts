import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { changeMemberRoleSchema } from "@/lib/validations/member.schema";
import {
  removeMember,
  changeMemberRole,
} from "@/lib/services/workspace.service";

/**
 * DELETE /api/workspaces/:id/members/:memberId
 *
 * Remove a member from a workspace.
 * Only owner or admin can remove members.
 * The workspace owner cannot be removed.
 *
 * RESPONSE:
 * - 200: `{ message: "Member removed" }`
 * - 400: Cannot remove the workspace owner
 * - 401: Unauthorized
 * - 403: Insufficient permissions (caller is a regular member)
 * - 404: Workspace not found / caller not a member / target not found
 * - 500: Internal server error
 *
 * @see {@link removeMember} for the service layer implementation
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId, memberId } = await params;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await removeMember(workspaceId, memberId, user.id);

    return NextResponse.json({ message: "Member removed" }, { status: 200 });
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
      if (err.message === "CANNOT_REMOVE_OWNER") {
        return NextResponse.json(
          { error: "Cannot remove the workspace owner" },
          { status: 400 }
        );
      }
      if (err.message === "MEMBER_NOT_FOUND") {
        return NextResponse.json(
          { error: "Member not found" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workspaces/:id/members/:memberId
 *
 * Change a member's role in a workspace.
 * Only the workspace owner can change roles.
 * Cannot change the owner's own role.
 * Cannot assign "owner" role (enforced by Zod schema).
 *
 * REQUEST BODY (JSON):
 * ```json
 * { "role": "admin" }
 * ```
 * - role: Required. Must be "admin" or "member".
 *
 * RESPONSE:
 * - 200: `{ message: "Role updated" }`
 * - 400: Validation error / cannot change owner's role / cannot assign owner
 * - 401: Unauthorized
 * - 403: Only the workspace owner can change roles
 * - 404: Workspace not found / caller not a member / target not found
 * - 500: Internal server error
 *
 * @see {@link changeMemberRole} for the service layer implementation
 * @see {@link changeMemberRoleSchema} for validation rules
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
): Promise<NextResponse> {
  try {
    const { id: workspaceId, memberId } = await params;

    // Validate request body
    const body = await request.json();
    const validation = changeMemberRoleSchema.safeParse(body);

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

    await changeMemberRole(workspaceId, memberId, validation.data.role, user.id);

    return NextResponse.json({ message: "Role updated" }, { status: 200 });
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
          { error: "Only the workspace owner can change roles" },
          { status: 403 }
        );
      }
      if (err.message === "CANNOT_CHANGE_OWNER") {
        return NextResponse.json(
          { error: "Cannot change the owner's role" },
          { status: 400 }
        );
      }
      if (err.message === "MEMBER_NOT_FOUND") {
        return NextResponse.json(
          { error: "Member not found" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
