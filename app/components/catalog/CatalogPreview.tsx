"use client";

import { useState } from "react";

interface PerDomainStat {
  domain: string;
  domain_id: string;
  matched: number;
  total: number;
}

interface PreviewContent {
  id: string;
  source_url: string;
  title: string | null;
  matched: boolean;
}

interface PreviewResult {
  matched_count: number;
  total_contents: number;
  per_domain: PerDomainStat[];
  matched_contents: PreviewContent[];
  warnings: string[];
  page: number;
  limit: number;
  total_pages: number;
}

interface CatalogPreviewProps {
  preview: PreviewResult | null;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
}

export default function CatalogPreview({
  preview,
  loading,
  page,
  onPageChange,
}: CatalogPreviewProps) {
  const [showExcluded] = useState(false);

  if (!preview && !loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">
          Select domains and add filters to see a preview.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-900">
          Preview
          {preview && !loading && (
            <span className="ml-2 text-gray-500">
              {preview.matched_count} / {preview.total_contents} contents
            </span>
          )}
        </h2>
        {loading && (
          <span className="text-xs text-gray-400">Loading...</span>
        )}
      </div>

      {/* Per-domain breakdown */}
      {preview && preview.per_domain.length > 0 && (
        <div className="space-y-2 mb-3">
          {preview.per_domain.map((stat) => {
            const percentage =
              stat.total > 0
                ? Math.round((stat.matched / stat.total) * 100)
                : 0;
            return (
              <div key={stat.domain_id}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">
                    {stat.domain}
                  </span>
                  <span className="text-gray-500">
                    {stat.matched} / {stat.total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Warnings */}
      {preview?.warnings.map((w, i) => (
        <div
          key={i}
          className="text-sm text-yellow-700 bg-yellow-50 rounded px-3 py-2 mb-2"
        >
          {w === "no_match"
            ? "No content matches these filters"
            : w === "too_broad"
            ? "These filters match more than 80% of your content"
            : w.startsWith("domain_no_match:")
            ? `No content matches for ${w.split(":")[1]}`
            : w}
        </div>
      ))}

      {/* Content list */}
      {preview && preview.matched_contents.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {preview.matched_contents
            .filter((c) => showExcluded || c.matched)
            .map((c) => (
              <div
                key={c.id}
                className={`rounded border px-3 py-1.5 ${
                  c.matched
                    ? "border-gray-200 bg-white"
                    : "border-gray-100 bg-gray-50 opacity-50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {c.matched ? (
                    <span className="text-green-500 text-xs">&#10003;</span>
                  ) : (
                    <span className="text-gray-400 text-xs">&#10007;</span>
                  )}
                  <span className="text-xs text-blue-600 truncate flex-1">
                    {c.source_url}
                  </span>
                </div>
                {c.title && (
                  <div className="text-xs text-gray-500 truncate ml-5">
                    {c.title}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Pagination */}
      {preview && preview.total_pages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {preview.page} of {preview.total_pages}
          </span>
          <button
            type="button"
            onClick={() =>
              onPageChange(Math.min(preview.total_pages, page + 1))
            }
            disabled={page >= preview.total_pages}
            className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
