"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Member {
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
}

interface Domain {
  id: string;
  domain: string;
  status: string;
  eventsLast24h?: number;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Settings Page Component
// ---------------------------------------------------------------------------

/**
 * Dashboard Settings Page
 *
 * Displays and manages workspace settings:
 * - Workspace info (name, creation date)
 * - Domain list
 * - Member management (invite, remove, change role)
 *
 * SDK keys are managed per-gateway on /dashboard/publisher/gateways.
 */
export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [loading, setLoading] = useState(true);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<Member | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const { id: workspaceId } = useWorkspace();

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [wsRes, membersRes] = await Promise.all([
        fetch(`/api/internal/workspaces/${workspaceId}`),
        fetch(`/api/internal/workspaces/${workspaceId}/members`),
      ]);

      if (wsRes.ok) {
        const wsData = await wsRes.json();
        setWorkspace(wsData);
        if (wsData.domains) setDomains(wsData.domains);
      }
      if (membersRes.ok) setMembers(await membersRes.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Members
  // ---------------------------------------------------------------------------

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });

    if (res.ok) {
      showToast("Member invited", "success");
      setInviteEmail("");
      void fetchData();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to invite member", "error");
    }
  };

  const executeRemoveMember = async (userId: string) => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/members/${userId}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      showToast("Member removed", "success");
      void fetchData();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to remove member", "error");
    }
    setRemoveMemberTarget(null);
  };

  const changeRole = async (userId: string, newRole: "admin" | "member") => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/members/${userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      }
    );

    if (res.ok) {
      showToast("Role updated", "success");
      void fetchData();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to update role", "error");
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-3xl space-y-8">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          Your workspace essentials: name, registered domains, and the
          teammates who can manage it with you. SDK keys live on the{" "}
          <a
            href="/dashboard/publisher/gateways"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Gateways
          </a>{" "}
          page.
        </p>
      </div>

      {/* Workspace Info */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Workspace</h2>
        <div className="text-sm text-gray-700">
          <p>
            <span className="font-medium">Name:</span> {workspace?.name}
          </p>
          <p className="mt-1">
            <span className="font-medium">Created:</span>{" "}
            {workspace?.created_at
              ? new Date(workspace.created_at).toLocaleDateString()
              : "-"}
          </p>
        </div>
      </section>

      {/* Domains */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Domains</h2>
        {domains.length === 0 ? (
          <p className="text-sm text-gray-500">
            No domains yet. Import a sitemap to register domains.
          </p>
        ) : (
          <div className="space-y-2">
            {domains.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2"
              >
                <span className="text-sm text-gray-700">{d.domain}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.status === "verified"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {d.status === "verified" ? "Verified" : "Pending"}
                  </span>
                  {d.status !== "verified" && d.eventsLast24h !== undefined && (
                    <span className="text-xs text-gray-500">
                      {d.eventsLast24h}/10 events (24h)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Members */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Members</h2>
        <div className="space-y-2 mb-4">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">{m.email}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {m.role}
                </span>
              </div>
              {m.role !== "owner" && (
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      changeRole(
                        m.user_id,
                        e.target.value as "admin" | "member"
                      )
                    }
                    className="rounded border border-gray-200 px-2 py-1 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                  <button
                    onClick={() => setRemoveMemberTarget(m)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={inviteMember} className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email address"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
          <select
            value={inviteRole}
            onChange={(e) =>
              setInviteRole(e.target.value as "admin" | "member")
            }
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit">Invite</Button>
        </form>
      </section>

      <ConfirmDialog
        open={!!removeMemberTarget}
        title={`Remove ${removeMemberTarget?.email ?? "member"}?`}
        description="This member will lose access to the workspace immediately."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() =>
          removeMemberTarget && executeRemoveMember(removeMemberTarget.user_id)
        }
        onCancel={() => setRemoveMemberTarget(null)}
      />
    </div>
  );
}
