"use client";

import Button from "@/app/components/ui/Button";

/**
 * Statuses emitted by the sitemap import pipeline (indexing_jobs.status).
 * The scraping/RAG layer was removed for MVP — these are the only states
 * we surface to the publisher dashboard.
 */
type IndexingStatus = "pending" | "processing" | "completed" | "failed";

interface DomainIndexingStatusProps {
  /** Current status from the latest import job */
  status: IndexingStatus | null;
  /** Number of URLs imported by the latest job */
  totalUrls: number | null;
  /** Error message if the job failed */
  errorMessage: string | null;
  /** Timestamp of the latest job update */
  lastRunAt: string | null;
  /** Whether a re-index request is in progress */
  reindexing: boolean;
  /** Callback to trigger a re-index */
  onReindex: () => void;
}

const STATUS_CONFIG: Record<
  IndexingStatus,
  { label: string; bgClass: string; textClass: string }
> = {
  pending: { label: "Pending", bgClass: "bg-yellow-100", textClass: "text-yellow-700" },
  processing: { label: "Importing…", bgClass: "bg-blue-100", textClass: "text-blue-700" },
  completed: { label: "Imported", bgClass: "bg-green-100", textClass: "text-green-700" },
  failed: { label: "Failed", bgClass: "bg-red-100", textClass: "text-red-700" },
};

export default function DomainIndexingStatus({
  status,
  totalUrls,
  errorMessage,
  lastRunAt,
  reindexing,
  onReindex,
}: DomainIndexingStatusProps) {
  if (!status) {
    return null;
  }

  const config = STATUS_CONFIG[status];
  const isInProgress = status === "pending" || status === "processing";
  const canReindex = status === "completed" || status === "failed";

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            Sitemap import
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.bgClass} ${config.textClass}`}
          >
            {config.label}
          </span>
        </div>

        {canReindex && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onReindex}
            loading={reindexing}
          >
            {reindexing ? "Re-indexing..." : "Re-index"}
          </Button>
        )}
      </div>

      {status === "completed" && (
        <div className="mt-2 flex gap-4 text-xs text-gray-500">
          {totalUrls != null && (
            <span>{totalUrls} URL{totalUrls !== 1 ? "s" : ""} imported</span>
          )}
          {lastRunAt && (
            <span>
              Last run: {new Date(lastRunAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {isInProgress && (
        <div className="mt-2 text-xs text-gray-500">
          Fetching and parsing the sitemap.
        </div>
      )}

      {status === "failed" && errorMessage && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
