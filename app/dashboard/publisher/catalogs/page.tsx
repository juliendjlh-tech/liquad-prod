"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import DropdownMenu from "@/app/components/ui/DropdownMenu";
import Toggle from "@/app/components/ui/Toggle";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

interface CatalogItem {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  price_eur: number;
  agent_count: number;
  content_count: number;
  rag_enabled: boolean;
  rag_source_count: number;
}

export default function CatalogsPage() {
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<CatalogItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);

  const { id: workspaceId } = useWorkspace();
  const router = useRouter();

  const showToast = (
    message: string,
    type: "success" | "error" | "warning"
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCatalogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/catalogs`);
      if (res.ok) setCatalogs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchCatalogs();
  }, [fetchCatalogs]);

  const toggleStatus = async (catalog: CatalogItem) => {
    setTogglingId(catalog.id);
    try {
      const newStatus = catalog.status === "active" ? "inactive" : "active";
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/catalogs/${catalog.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        if (json.warning) {
          showToast(json.warning, "warning");
        }
        void fetchCatalogs();
      }
    } finally {
      setTogglingId(null);
    }
  };

  const executeDelete = async (catalog: CatalogItem) => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/catalogs/${catalog.id}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      showToast("Catalog deleted", "success");
      void fetchCatalogs();
    }
    setConfirmTarget(null);
  };

  return (
    <div>
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-100 text-green-800"
              : toast.type === "warning"
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Catalogs</h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          A catalog groups pages you want to expose under the same rules:
          which AI crawlers can read them, and how much each access costs.
          Toggle marketplace availability to show or hide a catalog on the
          network without losing its setup.
        </p>
      </div>

      <div className="mb-6">
        <div className="flex gap-2 justify-end items-center">
          <Button href="/dashboard/catalogs/new">Create Catalog</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : catalogs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No catalogs created</p>
          <Button variant="ghost" href="/dashboard/catalogs/new">
            Create your first catalog
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {catalogs.map((catalog) => (
            <div
              key={catalog.id}
              className="group flex items-center justify-between rounded-lg border border-gray-200 bg-white px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {catalog.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      catalog.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {catalog.status === "active"
                      ? "Available on marketplace"
                      : "Hidden from marketplace"}
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-gray-500">
                  <span>{catalog.price_eur.toFixed(2)} EUR</span>
                  <span>{catalog.agent_count} active bot(s)</span>
                  <span>{catalog.content_count} content(s)</span>
                  {catalog.rag_enabled && (
                    <span className="inline-flex items-center gap-1 text-purple-600">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500" />
                      RAG ({catalog.rag_source_count} sources)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Toggle
                  checked={catalog.status === "active"}
                  onChange={() => toggleStatus(catalog)}
                  loading={togglingId === catalog.id}
                  label={`${catalog.status === "active" ? "Hide" : "Publish"} ${catalog.name} ${catalog.status === "active" ? "from" : "on"} marketplace`}
                />
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu
                    items={[
                      {
                        label: "Edit",
                        onClick: () =>
                          router.push(
                            `/dashboard/catalogs/${catalog.id}/edit`
                          ),
                      },
                      {
                        label: "Delete",
                        onClick: () => setConfirmTarget(catalog),
                        variant: "danger",
                        separator: true,
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        title={`Delete ${confirmTarget?.name ?? "catalog"}?`}
        description="This action cannot be undone. The catalog and its pricing rules will be permanently deleted."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmTarget && executeDelete(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
