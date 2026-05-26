"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";
import DomainIndexingStatus from "./DomainIndexingStatus";

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

interface DeleteImpact {
  content_count: number;
  affected_catalogs: Array<{ id: string; name: string }>;
}

export default function DomainDetailPage() {
  const { id: workspaceId } = useWorkspace();
  const router = useRouter();
  const params = useParams();
  const domainId = params.id as string;

  const [contents, setContents] = useState<PaginatedContents | null>(null);
  const [contentsPage, setContentsPage] = useState(1);
  const [contentsLoading, setContentsLoading] = useState(true);
  const [domainName, setDomainName] = useState<string | null>(null);

  // Scrape status state
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);
  const [scrapeTotalPages, setScrapeTotalPages] = useState<number | null>(null);
  const [scrapeProcessedPages, setScrapeProcessedPages] = useState<number | null>(null);
  const [scrapeChunkCount, setScrapeChunkCount] = useState<number | null>(null);
  const [scrapeErrorMessage, setScrapeErrorMessage] = useState<string | null>(null);
  const [lastScrapedAt, setLastScrapedAt] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);

  // Fetch domain info (name + scrape status)
  const fetchDomainInfo = useCallback(async () => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/domains/${domainId}`
    );
    if (res.ok) {
      const data = await res.json();
      setDomainName(data.domain);
      setScrapeStatus(data.scrape_status);
      setScrapeTotalPages(data.scrape_total_pages);
      setScrapeProcessedPages(data.scrape_processed_pages);
      setScrapeChunkCount(data.scrape_chunk_count);
      setScrapeErrorMessage(data.scrape_error_message);
      setLastScrapedAt(data.last_scraped_at);
    }
  }, [domainId, workspaceId]);

  useEffect(() => {
    void fetchDomainInfo();
  }, [fetchDomainInfo]);

  // Confirm dialog for content deletion
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Domain deletion
  const [showDeleteDomain, setShowDeleteDomain] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [deletingDomain, setDeletingDomain] = useState(false);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Fetch contents ──────────────────────────────────────────────────
  const fetchContents = useCallback(async () => {
    setContentsLoading(true);
    try {
      const params = new URLSearchParams({
        domain_id: domainId,
        page: contentsPage.toString(),
        limit: "50",
      });
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/contents?${params}`
      );
      if (res.ok) {
        const data = await res.json();
        setContents(data);
      }
    } finally {
      setContentsLoading(false);
    }
  }, [workspaceId, domainId, contentsPage, domainName]);

  useEffect(() => {
    void fetchContents();
  }, [fetchContents]);

  // ── Delete content ─────────────────────────────────────────────────
  const executeDeleteContent = async (id: string) => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/contents/${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      showToast("Content deleted", "success");
      void fetchContents();
    } else {
      showToast("Failed to delete", "error");
    }
    setConfirmDeleteId(null);
  };

  // ── Domain deletion with impact check ──────────────────────────────
  const handleDeleteDomainClick = async () => {
    // Fetch impact before showing confirmation
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/domains/${domainId}`
      );
      if (res.ok) {
        setDeleteImpact(await res.json());
        setShowDeleteDomain(true);
      } else {
        showToast("Failed to check deletion impact", "error");
      }
    } catch {
      showToast("Failed to check deletion impact", "error");
    }
  };

  const executeDeleteDomain = async () => {
    setDeletingDomain(true);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/domains/${domainId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        showToast("Domain deleted", "success");
        setTimeout(() => router.push("/dashboard/domains"), 1000);
      } else {
        showToast("Failed to delete domain", "error");
      }
    } catch {
      showToast("Failed to delete domain", "error");
    } finally {
      setDeletingDomain(false);
      setShowDeleteDomain(false);
    }
  };

  // Build domain delete description with impact details
  const deleteDomainDescription = deleteImpact
    ? [
        `This will permanently delete ${deleteImpact.content_count} content(s).`,
        deleteImpact.affected_catalogs.length > 0
          ? `${deleteImpact.affected_catalogs.length} catalog(s) will be updated: ${deleteImpact.affected_catalogs.map((c) => c.name).join(", ")}.`
          : null,
        "This action cannot be undone.",
      ]
        .filter(Boolean)
        .join(" ")
    : "This action cannot be undone.";

  // Trigger a full re-index for this domain
  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/contents/index`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain_id: domainId, reindex: true }),
        }
      );
      if (res.ok) {
        showToast("Re-indexing started", "success");
        // Refresh domain info to show the new status
        await fetchDomainInfo();
      } else {
        const json = await res.json();
        showToast(json.error ?? "Failed to start re-indexing", "error");
      }
    } catch {
      showToast("Failed to start re-indexing", "error");
    } finally {
      setReindexing(false);
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

      {/* Content deletion dialog */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete this content?"
        description="This action cannot be undone. The content URL will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDeleteId && executeDeleteContent(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* Domain deletion dialog */}
      <ConfirmDialog
        open={showDeleteDomain}
        title={`Delete domain ${domainName ?? ""}?`}
        description={deleteDomainDescription}
        confirmLabel={deletingDomain ? "Deleting..." : "Delete domain"}
        variant="danger"
        onConfirm={executeDeleteDomain}
        onCancel={() => setShowDeleteDomain(false)}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {domainName ?? "Domain"}
        </h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          All the pages Liquad has discovered on this domain. Add more from
          the sitemap, or remove the ones you don&apos;t want exposed to AI
          crawlers.
        </p>
      </div>

      <div className="mb-6">
        <div className="flex gap-2 justify-end items-center">
          {contents && (
            <span className="text-sm text-gray-500">
              {contents.total} content(s)
            </span>
          )}
          <Button
            size="sm"
            onClick={() => router.push(`/dashboard/domains/${domainId}/import`)}
          >
            Index contents
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDeleteDomainClick}
            className="text-red-600 hover:text-red-800 hover:bg-red-50"
          >
            Delete domain
          </Button>
        </div>
      </div>

      {/* Indexing status section */}
      <DomainIndexingStatus
        scrapeStatus={scrapeStatus as any}
        scrapeTotalPages={scrapeTotalPages}
        scrapeProcessedPages={scrapeProcessedPages}
        scrapeChunkCount={scrapeChunkCount}
        scrapeErrorMessage={scrapeErrorMessage}
        lastScrapedAt={lastScrapedAt}
        reindexing={reindexing}
        onReindex={handleReindex}
      />

      {/* Contents table */}
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
                onClick={() => setContentsPage((p) => Math.max(1, p - 1))}
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
                  setContentsPage((p) => Math.min(contents.totalPages, p + 1))
                }
                disabled={contentsPage >= contents.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
