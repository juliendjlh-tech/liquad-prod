"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

interface DomainItem {
  id: string;
  domain: string;
  status: string;
  content_count: number;
}

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

interface ImportJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: { imported: number; upserted: number };
  error_message?: string;
}

export default function ContentsPage() {
  const { id: workspaceId } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Domain list state
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [domainSearch, setDomainSearch] = useState("");
  const [domainsLoading, setDomainsLoading] = useState(true);

  // Selected domain driven by ?domain= query param
  const selectedDomain = searchParams.get("domain");
  const [contents, setContents] = useState<PaginatedContents | null>(null);
  const [contentsPage, setContentsPage] = useState(1);
  const [contentsLoading, setContentsLoading] = useState(false);

  // Import
  const [importUrl, setImportUrl] = useState("");
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Confirm dialog
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Fetch domains ──────────────────────────────────────────────────
  const fetchDomains = useCallback(async () => {
    setDomainsLoading(true);
    try {
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (domainSearch) params.set("search", domainSearch);

      const res = await fetch(`/api/domains?${params}`);
      if (res.ok) setDomains(await res.json());
    } finally {
      setDomainsLoading(false);
    }
  }, [workspaceId, domainSearch]);

  useEffect(() => {
    void fetchDomains();
  }, [fetchDomains]);

  // Debounce domain search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(domainSearch), 300);
    return () => clearTimeout(timer);
  }, [domainSearch]);

  useEffect(() => {
    void fetchDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // ── Fetch contents for selected domain ─────────────────────────────
  const fetchContents = useCallback(async () => {
    if (!selectedDomain) return;
    setContentsLoading(true);
    try {
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        domain: selectedDomain,
        page: contentsPage.toString(),
        limit: "50",
      });
      const res = await fetch(`/api/contents?${params}`);
      if (res.ok) setContents(await res.json());
    } finally {
      setContentsLoading(false);
    }
  }, [workspaceId, selectedDomain, contentsPage]);

  useEffect(() => {
    void fetchContents();
  }, [fetchContents]);

  // ── Poll import job status ─────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/contents/import/${jobId}`, {
            headers: { "x-workspace-id": workspaceId },
          });
          if (!res.ok) return;
          const job: ImportJob = await res.json();
          setImportJob(job);

          if (job.status === "completed") {
            stopPolling();
            const r = job.result;
            showToast(
              `Imported ${r?.imported ?? 0} URLs (${r?.upserted ?? 0} upserted)`,
              "success"
            );
            setImportJob(null);
            void fetchDomains();
            if (selectedDomain) void fetchContents();
          } else if (job.status === "failed") {
            stopPolling();
            showToast(job.error_message ?? "Import failed", "error");
            setImportJob(null);
          }
        } catch {
          // Ignore polling errors, will retry on next interval
        }
      }, 2000);
    },
    [workspaceId, stopPolling, fetchDomains, fetchContents, selectedDomain]
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ── Import sitemap ─────────────────────────────────────────────────
  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl || importJob) return;

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

      if (res.ok || res.status === 202) {
        setImportJob({ id: json.jobId, status: "pending" });
        setImportUrl("");
        startPolling(json.jobId);
      } else {
        showToast(json.error ?? "Import failed", "error");
      }
    } catch {
      showToast("Import failed", "error");
    }
  };

  // ── Delete content ─────────────────────────────────────────────────
  const executeDelete = async (id: string) => {
    const res = await fetch(`/api/contents/${id}`, {
      method: "DELETE",
      headers: { "x-workspace-id": workspaceId },
    });
    if (res.ok) {
      showToast("Content deleted", "success");
      void fetchContents();
      void fetchDomains();
    } else {
      showToast("Failed to delete", "error");
    }
    setConfirmDeleteId(null);
  };

  // ── Select / back ──────────────────────────────────────────────────
  const openDomain = (domain: string) => {
    setContentsPage(1);
    setContents(null);
    router.push(`/dashboard/contents?domain=${encodeURIComponent(domain)}`);
  };

  const goBack = () => {
    setContents(null);
    setContentsPage(1);
    router.push("/dashboard/contents");
  };

  // ── Total content count ────────────────────────────────────────────
  const totalContents = domains.reduce((sum, d) => sum + d.content_count, 0);

  // ── Import status helpers ──────────────────────────────────────────
  const isImporting = importJob !== null;
  const importStatusLabel =
    importJob?.status === "pending"
      ? "Starting import..."
      : importJob?.status === "processing"
        ? "Importing..."
        : null;

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

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {selectedDomain ?? "Contents"}
        </h1>
        {!selectedDomain && (
          <span className="text-sm text-gray-500">
            {domains.length} domain(s) &middot; {totalContents} content(s)
          </span>
        )}
        {selectedDomain && contents && (
          <span className="text-sm text-gray-500">
            {contents.total} content(s)
          </span>
        )}
      </div>

      {/* Import form — always visible */}
      <form onSubmit={handleImport} className="mb-6">
        <div className="flex gap-2">
          <input
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://example.com/sitemap.xml"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
            disabled={isImporting}
          />
          <Button type="submit" loading={isImporting}>
            {isImporting ? importStatusLabel : "Import Sitemap"}
          </Button>
        </div>
        {isImporting && (
          <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>{importStatusLabel} This may take a few minutes for large sitemaps.</span>
          </div>
        )}
      </form>

      {/* ─── Domain list view ───────────────────────────────────────── */}
      {!selectedDomain && (
        <>
          {/* Domain search */}
          <input
            type="text"
            value={domainSearch}
            onChange={(e) => setDomainSearch(e.target.value)}
            placeholder="Search domains..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4"
          />

          {domainsLoading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : domains.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No domains yet</p>
              <p className="text-sm text-gray-400">
                Import a sitemap.xml to add your first domain
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {domains.map((d) => (
                <button
                  key={d.id}
                  onClick={() => openDomain(d.domain)}
                  className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4 text-left hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      {d.domain}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        d.status === "verified"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {d.status === "verified" ? "Verified" : "Unverified"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      {d.content_count} content(s)
                    </span>
                    <span className="text-gray-400">&rsaquo;</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── Contents view for selected domain ──────────────────────── */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete this content?"
        description="This action cannot be undone. The content URL will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDeleteId && executeDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {selectedDomain && (
        <>
          {contentsLoading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : !contents || contents.items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No contents for this domain</p>
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
                        Last Modified
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {contents.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-900 max-w-lg truncate">
                          {item.source_url}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {item.lastmod
                            ? new Date(item.lastmod).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setConfirmDeleteId(item.id)}
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
              {contents.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setContentsPage((p) => Math.max(1, p - 1))
                    }
                    disabled={contentsPage <= 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {contents.page} of {contents.totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setContentsPage((p) =>
                        Math.min(contents.totalPages, p + 1)
                      )
                    }
                    disabled={contentsPage >= contents.totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
