"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

type Status = "pending" | "accepted" | "revoked";

interface Invite {
  network_id: string;
  catalog_id: string;
  status: Status;
  invited_at: string;
  responded_at: string | null;
  invited_by: string | null;
  network: {
    id: string;
    public_id: string;
    name: string;
    workspace_id: string;
  };
}

export default function CatalogNetworksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: catalogId } = use(params);
  const { id: workspaceId } = useWorkspace();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/catalogs/${catalogId}/network-invites`,
      );
      if (res.ok) setInvites(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId, catalogId]);

  useEffect(() => {
    void fetchInvites();
  }, [fetchInvites]);

  const respond = async (networkId: string, action: "accept" | "revoke") => {
    setActingOn(networkId);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/catalogs/${catalogId}/network-invites/${networkId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (res.ok) void fetchInvites();
    } finally {
      setActingOn(null);
    }
  };

  const byStatus = (s: Status) => invites.filter((i) => i.status === s);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/publisher/licence/catalogs/${catalogId}/edit`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to catalogue
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Networks</h1>
        <p className="mt-1 text-sm text-gray-600">
          Networks that have invited this catalogue. Accept to make it part of
          the network, revoke to remove. Active grants survive a revoke — only
          new requests are affected.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <>
          <Section
            title={`Pending (${byStatus("pending").length})`}
            emptyText="No pending invites."
          >
            {byStatus("pending").map((i) => (
              <InviteRow
                key={i.network_id}
                invite={i}
                busy={actingOn === i.network_id}
                onAccept={() => respond(i.network_id, "accept")}
                onRevoke={() => respond(i.network_id, "revoke")}
              />
            ))}
          </Section>

          <Section
            title={`Accepted (${byStatus("accepted").length})`}
            emptyText="Not part of any network yet."
          >
            {byStatus("accepted").map((i) => (
              <InviteRow
                key={i.network_id}
                invite={i}
                busy={actingOn === i.network_id}
                onRevoke={() => respond(i.network_id, "revoke")}
              />
            ))}
          </Section>

          <Section
            title={`Revoked (${byStatus("revoked").length})`}
            emptyText="No revoked memberships."
          >
            {byStatus("revoked").map((i) => (
              <InviteRow key={i.network_id} invite={i} busy={false} />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasChildren = items.some((c) => c !== false && c !== null && c !== undefined);
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {hasChildren ? (
          children
        ) : (
          <div className="px-4 py-6 text-center text-sm text-gray-500">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

function InviteRow({
  invite,
  busy,
  onAccept,
  onRevoke,
}: {
  invite: Invite;
  busy: boolean;
  onAccept?: () => void;
  onRevoke?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <div>
        <div className="font-medium text-gray-900">{invite.network.name}</div>
        <div className="text-xs text-gray-500">
          {invite.network.public_id} · invited{" "}
          {new Date(invite.invited_at).toLocaleDateString()}
          {invite.responded_at && (
            <> · responded {new Date(invite.responded_at).toLocaleDateString()}</>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {onAccept && (
          <Button variant="primary" disabled={busy} onClick={onAccept}>
            Accept
          </Button>
        )}
        {onRevoke && (
          <Button variant="secondary" disabled={busy} onClick={onRevoke}>
            {invite.status === "pending" ? "Decline" : "Revoke"}
          </Button>
        )}
      </div>
    </div>
  );
}
