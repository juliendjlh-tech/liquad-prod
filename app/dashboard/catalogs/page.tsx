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
  name: string;
  description: string | null;
  status: "active" | "inactive";
  price_eur: number;
  agent_count: number;
  content_count: number;
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
      const res = await fetch("/api/catalogs", {
        headers: { "x-workspace-id": workspaceId },
      });
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
      const res = await fetch(`/api/catalogs/${catalog.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ status: newStatus }),
      });

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
    const res = await fetch(`/api/catalogs/${catalog.id}`, {
      method: "DELETE",
      headers: { "x-workspace-id": workspaceId },
    });

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

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Catalogs</h1>
        <Button href="/dashboard/catalogs/new">Create Catalog</Button>
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
                    {catalog.status}
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-gray-500">
                  <span>{catalog.price_eur.toFixed(2)} EUR</span>
                  <span>{catalog.agent_count} bot(s)</span>
                  <span>{catalog.content_count} content(s)</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Toggle
                  checked={catalog.status === "active"}
                  onChange={() => toggleStatus(catalog)}
                  loading={togglingId === catalog.id}
                  label={`Toggle ${catalog.name} ${catalog.status === "active" ? "off" : "on"}`}
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
