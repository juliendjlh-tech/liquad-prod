"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

interface Gateway {
  id: string;
  public_id: string;
  workspace_id: string;
  label: string | null;
  api_key_prefix: string;
  catalog_ids: string[];
  created_at: string;
}

interface CatalogOption {
  public_id: string;
  name: string;
  status: string;
}

export default function GatewaysPage() {
  const { id: workspaceId } = useWorkspace();

  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNew, setShowNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCatalogIds, setNewCatalogIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [active, setActive] = useState<Gateway | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCatalogIds, setEditCatalogIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Gateway | null>(null);
  const [confirmRotate, setConfirmRotate] = useState<Gateway | null>(null);
  const [rotating, setRotating] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ----- fetchers --------------------------------------------------

  const fetchGateways = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/gateways`);
      if (res.ok) setGateways(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchCatalogs = useCallback(async () => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/catalogs`);
    if (res.ok) {
      const data = (await res.json()) as Array<{
        public_id: string;
        name: string;
        status: string;
      }>;
      setCatalogs(
        data.map((c) => ({
          public_id: c.public_id,
          name: c.name,
          status: c.status,
        }))
      );
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchGateways();
    void fetchCatalogs();
  }, [fetchGateways, fetchCatalogs]);

  // ----- create ----------------------------------------------------

  const createOne = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/gateways`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim() || null,
          catalog_ids: newCatalogIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Failed to create gateway", "error");
        return;
      }
      const payload = (await res.json()) as {
        gateway: Gateway;
        api_key: string;
      };
      setShowNew(false);
      setNewLabel("");
      setNewCatalogIds([]);
      setRevealedKey(payload.api_key);
      setActive(payload.gateway);
      setEditLabel(payload.gateway.label ?? "");
      setEditCatalogIds(payload.gateway.catalog_ids);
      void fetchGateways();
    } finally {
      setCreating(false);
    }
  };

  // ----- detail ----------------------------------------------------

  const openDetail = (gw: Gateway) => {
    setActive(gw);
    setRevealedKey(null);
    setEditLabel(gw.label ?? "");
    setEditCatalogIds(gw.catalog_ids);
  };

  const closeDetail = () => {
    setActive(null);
    setRevealedKey(null);
  };

  const saveDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/gateways/${active.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: editLabel.trim() || null,
            catalog_ids: editCatalogIds,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Failed to save", "error");
        return;
      }
      const updated = (await res.json()) as Gateway;
      setActive(updated);
      setGateways((prev) =>
        prev.map((g) => (g.id === updated.id ? updated : g))
      );
      showToast("Gateway updated", "success");
    } finally {
      setSaving(false);
    }
  };

  const rotateKey = async (gw: Gateway) => {
    setRotating(true);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/gateways/${gw.id}/regenerate-key`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Failed to rotate key", "error");
        return;
      }
      const { api_key } = (await res.json()) as { api_key: string };
      setRevealedKey(api_key);
      showToast("New key generated", "success");
      void fetchGateways();
    } finally {
      setRotating(false);
      setConfirmRotate(null);
    }
  };

  const deleteOne = async (gw: Gateway) => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/gateways/${gw.id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to delete", "error");
      setConfirmDelete(null);
      return;
    }
    showToast("Gateway deleted", "success");
    setConfirmDelete(null);
    if (active?.id === gw.id) closeDetail();
    void fetchGateways();
  };

  const toggleNewCatalog = (publicId: string) =>
    setNewCatalogIds((p) =>
      p.includes(publicId) ? p.filter((id) => id !== publicId) : [...p, publicId]
    );

  const toggleEditCatalog = (publicId: string) =>
    setEditCatalogIds((p) =>
      p.includes(publicId) ? p.filter((id) => id !== publicId) : [...p, publicId]
    );

  // ----- render ----------------------------------------------------

  return (
    <div>
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[60] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Gateways</h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            A gateway authenticates your deployed SDK and decides which
            catalogs are exposed to crawlers. Each gateway carries its own API
            key and its own catalog allowlist.
          </p>
        </div>
        <Link
          href="/dashboard/publisher/integration"
          className="text-sm text-blue-600 hover:text-blue-800 underline whitespace-nowrap mt-1"
        >
          View integration guide →
        </Link>
      </div>

      <div className="mb-6 flex justify-end">
        <Button onClick={() => setShowNew(true)}>New gateway</Button>
      </div>

      {showNew && (
        <form
          onSubmit={createOne}
          className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
        >
          <h3 className="text-sm font-medium text-gray-900">New gateway</h3>
          <p className="text-xs text-gray-500">
            The API key is generated immediately and shown once. Catalogs
            outside the allowlist are never exposed.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Label (optional)
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. production"
              maxLength={100}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Catalogs exposed ({newCatalogIds.length} selected)
            </label>
            {catalogs.length === 0 ? (
              <div className="text-xs text-gray-400 italic">
                No catalogs in this workspace yet.
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-md border border-gray-300 bg-white">
                {catalogs.map((cat) => (
                  <label
                    key={cat.public_id}
                    className="flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={newCatalogIds.includes(cat.public_id)}
                      onChange={() => toggleNewCatalog(cat.public_id)}
                    />
                    <span className="truncate">{cat.name}</span>
                    <span
                      className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        cat.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {cat.status === "active" ? "Marketplace" : "Private"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowNew(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create gateway
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : gateways.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No gateways yet. Create one to issue an SDK key.
        </div>
      ) : (
        <div className="space-y-2">
          {gateways.map((gw) => (
            <button
              key={gw.id}
              onClick={() => openDetail(gw)}
              className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {gw.label ?? (
                      <span className="text-gray-400">Unlabeled gateway</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500 font-mono truncate">
                    {gw.api_key_prefix}…
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {gw.catalog_ids.length} catalog
                    {gw.catalog_ids.length === 1 ? "" : "s"} exposed · created{" "}
                    {new Date(gw.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ===================== DETAIL DRAWER ===================== */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={closeDetail}
        >
          <div
            className="h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {active.label ?? (
                      <span className="text-gray-400">Unlabeled gateway</span>
                    )}
                  </h2>
                  <div className="mt-1 text-xs text-gray-500 font-mono">
                    {active.api_key_prefix}…
                  </div>
                </div>
                <button
                  onClick={closeDetail}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {revealedKey && (
                <div className="rounded-lg border border-green-300 bg-green-50 p-4">
                  <p className="text-sm font-medium text-green-900 mb-2">
                    Key created — copy it now, it will not be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-gray-900 text-white font-mono text-xs p-2 break-all">
                      {revealedKey}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(revealedKey);
                        showToast("Key copied", "success");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}

              <form
                onSubmit={saveDetail}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
              >
                <h3 className="text-sm font-medium text-gray-900">Configuration</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Label
                  </label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    maxLength={100}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Catalogs exposed ({editCatalogIds.length} selected)
                  </label>
                  {catalogs.length === 0 ? (
                    <div className="text-xs text-gray-400 italic">
                      No catalogs in this workspace yet.
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-md border border-gray-300 bg-white">
                      {catalogs.map((cat) => (
                        <label
                          key={cat.public_id}
                          className="flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={editCatalogIds.includes(cat.public_id)}
                            onChange={() => toggleEditCatalog(cat.public_id)}
                          />
                          <span className="truncate">{cat.name}</span>
                          <span className="ml-auto text-xs text-gray-400 font-mono">
                            {cat.status}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button type="submit" loading={saving}>
                    Save
                  </Button>
                </div>
              </form>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                <h3 className="text-sm font-medium text-gray-900">Danger zone</h3>
                <p className="text-xs text-gray-500">
                  Rotating the key invalidates the current one immediately and
                  breaks deployments using it. Deleting the gateway removes the
                  key entirely.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmRotate(active)}
                    loading={rotating}
                  >
                    Rotate key
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(active)}
                  >
                    Delete gateway
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.label ?? "gateway"}?`}
        description="The API key will be invalidated immediately. Deployed SDK instances using this key will start receiving 401."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDelete && deleteOne(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={!!confirmRotate}
        title={`Rotate key for ${confirmRotate?.label ?? "this gateway"}?`}
        description="The current key will stop working immediately. You will need to redeploy with the new key."
        confirmLabel="Rotate"
        variant="danger"
        onConfirm={() => confirmRotate && rotateKey(confirmRotate)}
        onCancel={() => setConfirmRotate(null)}
      />
    </div>
  );
}
