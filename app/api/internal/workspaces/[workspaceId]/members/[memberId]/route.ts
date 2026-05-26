import { NextRequest, NextResponse } from "next/server";
import { changeMemberRoleSchema } from "@/lib/validations/member.schema";
import {
  removeMember,
  changeMemberRole,
} from "@/lib/services/workspace.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * DELETE /api/internal/workspaces/:workspaceId/members/:memberId
 *
 * Remove a member from a workspace. Owner/admin only. The owner cannot be removed.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, memberId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    await removeMember(workspaceId, memberId, userId);

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
 * PATCH /api/internal/workspaces/:workspaceId/members/:memberId
 *
 * Change a member's role. Owner only. Cannot change the owner's own role
 * and cannot assign "owner" (Zod-enforced).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param, memberId } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const body = await request.json();
    const validation = changeMemberRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    await changeMemberRole(workspaceId, memberId, validation.data.role, userId);

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
