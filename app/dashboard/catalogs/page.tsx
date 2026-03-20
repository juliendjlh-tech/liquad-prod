"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useWorkspace } from "@/app/dashboard/workspace-context";

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
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);

  const { id: workspaceId } = useWorkspace();

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
  };

  const deleteCatalog = async (id: string) => {
    if (!confirm("Delete this catalog?")) return;

    const res = await fetch(`/api/catalogs/${id}`, {
      method: "DELETE",
      headers: { "x-workspace-id": workspaceId },
    });

    if (res.ok) {
      showToast("Catalog deleted", "success");
      void fetchCatalogs();
    }
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
        <Link
          href="/dashboard/catalogs/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Catalog
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : catalogs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No catalogs created</p>
          <Link
            href="/dashboard/catalogs/new"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Create your first catalog
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {catalogs.map((catalog) => (
            <div
              key={catalog.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-6 py-4"
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
                <button
                  onClick={() => toggleStatus(catalog)}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  {catalog.status === "active" ? "Deactivate" : "Activate"}
                </button>
                <Link
                  href={`/dashboard/catalogs/${catalog.id}/edit`}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Edit
                </Link>
                <button
                  onClick={() => deleteCatalog(catalog.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
