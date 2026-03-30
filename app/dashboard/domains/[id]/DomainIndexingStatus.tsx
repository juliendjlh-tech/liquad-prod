"use client";

import Button from "@/app/components/ui/Button";

/**
 * Possible indexing statuses from the import_jobs table.
 * - none: no indexing has been initiated
 * - pending: indexing is queued
 * - scraping: actively processing pages (fetching + chunking + embedding)
 * - scraped: successfully completed
 * - error: indexing failed
 * - pending_retry: waiting to retry after an error
 */
type IndexingStatus =
  | "none"
  | "pending"
  | "scraping"
  | "scraped"
  | "error"
  | "pending_retry";

interface DomainIndexingStatusProps {
  /** Current indexing status from the latest import job */
  scrapeStatus: IndexingStatus | null;
  /** Total number of pages to index */
  scrapeTotalPages: number | null;
  /** Number of pages already processed */
  scrapeProcessedPages: number | null;
  /** Total chunks created from indexing */
  scrapeChunkCount: number | null;
  /** Error message if indexing failed */
  scrapeErrorMessage: string | null;
  /** Timestamp of last indexing activity */
  lastScrapedAt: string | null;
  /** Whether a re-index request is in progress */
  reindexing: boolean;
  /** Callback to trigger a re-index */
  onReindex: () => void;
}

/**
 * Displays the indexing status for a domain.
 * Shows a progress bar when actively indexing, error details on failure,
 * and a "Re-index" button when indexing is complete or errored.
 */
export default function DomainIndexingStatus({
  scrapeStatus,
  scrapeTotalPages,
  scrapeProcessedPages,
  scrapeChunkCount,
  scrapeErrorMessage,
  lastScrapedAt,
  reindexing,
  onReindex,
}: DomainIndexingStatusProps) {
  // Don't render anything if there's no indexing data at all
  if (!scrapeStatus || scrapeStatus === "none") {
    return null;
  }

  // Compute progress percentage for the progress bar
  const progressPercent =
    scrapeTotalPages && scrapeProcessedPages
      ? Math.round((scrapeProcessedPages / scrapeTotalPages) * 100)
      : 0;

  // Status badge color + label mapping
  const statusConfig: Record<
    IndexingStatus,
    { label: string; bgClass: string; textClass: string }
  > = {
    none: { label: "Not indexed", bgClass: "bg-gray-100", textClass: "text-gray-600" },
    pending: { label: "Pending", bgClass: "bg-yellow-100", textClass: "text-yellow-700" },
    scraping: { label: "Indexing...", bgClass: "bg-blue-100", textClass: "text-blue-700" },
    scraped: { label: "Indexed", bgClass: "bg-green-100", textClass: "text-green-700" },
    error: { label: "Error", bgClass: "bg-red-100", textClass: "text-red-700" },
    pending_retry: { label: "Retrying...", bgClass: "bg-yellow-100", textClass: "text-yellow-700" },
  };

  const config = statusConfig[scrapeStatus];
  const isInProgress =
    scrapeStatus === "pending" ||
    scrapeStatus === "scraping" ||
    scrapeStatus === "pending_retry";
  const canReindex = scrapeStatus === "scraped" || scrapeStatus === "error";

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            Indexing Status
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.bgClass} ${config.textClass}`}
          >
            {config.label}
          </span>
        </div>

        {/* Re-index button: only visible when indexing is done or errored */}
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

      {/* Progress bar — visible when indexing is in progress */}
      {isInProgress && scrapeTotalPages && scrapeTotalPages > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>
              {scrapeProcessedPages ?? 0} / {scrapeTotalPages} pages
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats when indexing is complete */}
      {scrapeStatus === "scraped" && (
        <div className="mt-2 flex gap-4 text-xs text-gray-500">
          {scrapeChunkCount != null && (
            <span>{scrapeChunkCount} chunks indexed</span>
          )}
          {lastScrapedAt && (
            <span>
              Last indexed: {new Date(lastScrapedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Error message when indexing failed */}
      {scrapeStatus === "error" && scrapeErrorMessage && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">
          {scrapeErrorMessage}
        </div>
      )}
    </div>
  );
}
