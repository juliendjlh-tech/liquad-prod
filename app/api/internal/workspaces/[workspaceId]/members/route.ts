import { NextRequest, NextResponse } from "next/server";
import { inviteMemberSchema } from "@/lib/validations/member.schema";
import {
  getWorkspaceMembers,
  inviteMember,
} from "@/lib/services/workspace.service";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/members
 *
 * List members of a workspace (any member). Returns 404 for non-members
 * to avoid leaking workspace existence.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const members = await getWorkspaceMembers(workspaceId, userId);
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
 * POST /api/internal/workspaces/:workspaceId/members
 *
 * Invite a new member by email. Owner/admin only. MVP: invitations are
 * auto-accepted (no email flow).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.workspace;

    const body = await request.json();
    const validation = inviteMemberSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, role } = validation.data;
    const member = await inviteMember(workspaceId, userId, email, role);

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
