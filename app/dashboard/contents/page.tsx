"use client";

import { useState, useEffect, useCallback } from "react";

interface ContentRow {
  id: string;
  source_url: string;
  domain: string;
  lastmod: string | null;
  created_at: string;
}

interface PaginatedContents {
  items: ContentRow[];
  total: number;
  page: number;
  totalPages: number;
}

export default function ContentsPage() {
  const [data, setData] = useState<PaginatedContents | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const workspaceId =
    typeof window !== "undefined"
      ? document.cookie
          .split("; ")
          .find((c) => c.startsWith("workspace_id="))
          ?.split("=")[1] ?? ""
      : "";

  const fetchContents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        page: page.toString(),
        limit: "50",
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/contents?${params}`);
      if (res.ok) {
        const json = (await res.json()) as PaginatedContents;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, search]);

  useEffect(() => {
    if (workspaceId) void fetchContents();
  }, [workspaceId, fetchContents]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl) return;
    setImporting(true);

    try {
      const res = await fetch("/api/contents/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ url: importUrl }),
      });
      const json = await res.json();

      if (res.ok) {
        showToast(
          `Imported ${json.imported} URLs (${json.created} created, ${json.updated} updated)`,
          "success"
        );
        setImportUrl("");
        void fetchContents();
      } else {
        showToast(json.error ?? "Import failed", "error");
      }
    } catch {
      showToast("Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this content?")) return;

    const res = await fetch(`/api/contents/${id}`, {
      method: "DELETE",
      headers: { "x-workspace-id": workspaceId },
    });

    if (res.ok) {
      showToast("Content deleted", "success");
      void fetchContents();
    } else {
      showToast("Failed to delete", "error");
    }
  };

  return (
    <div>
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

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contents</h1>
        {data && (
          <span className="text-sm text-gray-500">
            {data.total} contents imported
          </span>
        )}
      </div>

      {/* Import form */}
      <form onSubmit={handleImport} className="flex gap-2 mb-6">
        <input
          type="url"
          value={importUrl}
          onChange={(e) => setImportUrl(e.target.value)}
          placeholder="https://example.com/sitemap.xml"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={importing}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {importing ? "Importing..." : "Import"}
        </button>
      </form>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by URL..."
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4"
      />

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : !data || data.items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No content imported yet</p>
          <p className="text-sm text-gray-400">
            Import from sitemap.xml to get started
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    URL
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Domain
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Modified
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                      {item.source_url}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {item.domain}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {item.lastmod
                        ? new Date(item.lastmod).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
