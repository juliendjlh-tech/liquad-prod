"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

type Status = "pending" | "accepted" | "revoked";

interface NetworkDetail {
  id: string;
  public_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  catalogs: Array<{
    catalog_id: string;
    status: Status;
    invited_at: string;
    responded_at: string | null;
  }>;
}

interface CatalogMeta {
  id: string;
  public_id: string;
  name: string;
  workspace_id: string;
  price_eur: number;
  status: "active" | "inactive";
}

export default function NetworkDetailPage() {
  const params = useParams<{ networkId: string }>();
  const router = useRouter();
  const { id: workspaceId } = useWorkspace();
  const networkId = params.networkId;

  const [network, setNetwork] = useState<NetworkDetail | null>(null);
  const [catalogMeta, setCatalogMeta] = useState<Map<string, CatalogMeta>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const fetchNetwork = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/networks/${networkId}`,
      );
      if (res.status === 404) {
        router.replace("/dashboard/publisher/networks");
        return;
      }
      if (!res.ok) return;
      const data: NetworkDetail = await res.json();
      setNetwork(data);

      // Hydrate catalog metadata (name, price, owner workspace) for display.
      const ids = data.catalogs.map((c) => c.catalog_id);
      if (ids.length > 0) {
        const metas = await fetchCatalogMetas(ids, workspaceId);
        setCatalogMeta(metas);
      } else {
        setCatalogMeta(new Map());
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, networkId, router]);

  useEffect(() => {
    void fetchNetwork();
  }, [fetchNetwork]);

  if (loading || !network) {
    return <div className="text-sm text-gray-500">Loading…</div>;
  }

  const byStatus = (s: Status) => network.catalogs.filter((c) => c.status === s);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{network.name}</h1>
          {network.description && (
            <p className="mt-1 text-sm text-gray-600">{network.description}</p>
          )}
          <p className="mt-1 font-mono text-xs text-gray-400">{network.public_id}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowInvite(true)}>
            Invite catalogues
          </Button>
        </div>
      </div>

      <Section
        title={`Accepted (${byStatus("accepted").length})`}
        emptyText="No catalogues yet. Invite some from the marketplace."
      >
        {byStatus("accepted").map((row) => (
          <CatalogRow
            key={row.catalog_id}
            row={row}
            meta={catalogMeta.get(row.catalog_id)}
          />
        ))}
      </Section>

      <Section title={`Pending (${byStatus("pending").length})`} emptyText="No pending invites.">
        {byStatus("pending").map((row) => (
          <CatalogRow
            key={row.catalog_id}
            row={row}
            meta={catalogMeta.get(row.catalog_id)}
          />
        ))}
      </Section>

      <Section title={`Revoked (${byStatus("revoked").length})`} emptyText="No revoked memberships.">
        {byStatus("revoked").map((row) => (
          <CatalogRow
            key={row.catalog_id}
            row={row}
            meta={catalogMeta.get(row.catalog_id)}
          />
        ))}
      </Section>

      {showInvite && (
        <InviteModal
          workspaceId={workspaceId}
          networkId={networkId}
          existingCatalogIds={network.catalogs.map((c) => c.catalog_id)}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            void fetchNetwork();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) && children.length > 0;
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

function CatalogRow({
  row,
  meta,
}: {
  row: NetworkDetail["catalogs"][number];
  meta: CatalogMeta | undefined;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <div>
        <div className="font-medium text-gray-900">
          {meta?.name ?? <span className="text-gray-400">[unknown catalogue]</span>}
        </div>
        <div className="text-xs text-gray-500">
          {meta?.public_id ?? row.catalog_id} · invited{" "}
          {new Date(row.invited_at).toLocaleDateString()}
          {row.responded_at && (
            <> · responded {new Date(row.responded_at).toLocaleDateString()}</>
          )}
        </div>
      </div>
      <div className="text-right">
        {meta?.price_eur !== undefined && (
          <div className="text-xs text-gray-700">€{meta.price_eur.toFixed(2)} / fetch</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite modal — picker from marketplace catalogues
// ---------------------------------------------------------------------------

function InviteModal({
  workspaceId,
  networkId,
  existingCatalogIds,
  onClose,
  onInvited,
}: {
  workspaceId: string;
  networkId: string;
  existingCatalogIds: string[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [catalogs, setCatalogs] = useState<CatalogMeta[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        // Marketplace listing (all active catalogues across publishers).
        const res = await fetch(
          `/api/internal/workspaces/${workspaceId}/catalogs/marketplace`,
        );
        if (!cancel && res.ok) {
          const data = await res.json();
          setCatalogs(Array.isArray(data) ? data : data.catalogs ?? []);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const existing = new Set(existingCatalogIds);
  const candidates = catalogs.filter((c) => !existing.has(c.id) && c.status === "active");

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleInvite = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/networks/${networkId}/invites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catalog_ids: [...selected] }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to send invites");
        return;
      }
      onInvited();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-base font-semibold text-gray-900">Invite catalogues</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-4">
          {loading ? (
            <div className="text-sm text-gray-500">Loading marketplace…</div>
          ) : candidates.length === 0 ? (
            <div className="text-sm text-gray-500">
              No catalogues available to invite. Either none are active on the
              marketplace, or all are already in this network.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {candidates.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-500">
                      {c.public_id} · €{c.price_eur.toFixed(2)} / fetch
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="border-t border-gray-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleInvite}
            disabled={submitting || selected.size === 0}
          >
            {submitting ? "Sending…" : `Invite ${selected.size}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchCatalogMetas(
  ids: string[],
  workspaceId: string,
): Promise<Map<string, CatalogMeta>> {
  // Best-effort hydration: try the marketplace catalogues endpoint, fall back
  // silently on failure (rows render with their UUID only).
  try {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/catalogs/marketplace`,
    );
    if (!res.ok) return new Map();
    const data = await res.json();
    const list: CatalogMeta[] = Array.isArray(data) ? data : data.catalogs ?? [];
    const filtered = list.filter((c) => ids.includes(c.id));
    return new Map(filtered.map((c) => [c.id, c]));
  } catch {
    return new Map();
  }
}
