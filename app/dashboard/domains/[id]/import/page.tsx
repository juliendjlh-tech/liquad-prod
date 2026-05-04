"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import PathRuleRow from "@/app/components/catalog/PathRuleRow";
import type { PathOperator } from "@/lib/validations/catalog.schema";

interface PathRule {
  operator: PathOperator;
  value: string;
}

interface DomainInfo {
  domain: string;
  sitemap_url: string | null;
  content_count: number;
}

interface PreviewResult {
  total: number;
  matched: number;
  matched_urls: string[];
}

interface ImportJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: { imported: number; upserted: number };
  error_message?: string;
}

export default function ImportDomainPage() {
  const router = useRouter();
  const { id: workspaceId } = useWorkspace();
  const params = useParams();
  const domainId = params.id as string;

  // Domain info
  const [domainInfo, setDomainInfo] = useState<DomainInfo | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);

  // Filters
  const [pathRules, setPathRules] = useState<PathRule[]>([]);
  const [pathLogic, setPathLogic] = useState<"AND" | "OR">("AND");

  // Max pages
  const [maxPages, setMaxPages] = useState(100);

  // Preview
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Import
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Fetch domain info ──────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/domains/${domainId}`, {
        headers: { "x-workspace-id": workspaceId },
      });
      if (res.ok) {
        const data = await res.json();
        setDomainInfo({
          domain: data.domain,
          sitemap_url: data.sitemap_url,
          content_count: data.content_count,
        });
      } else {
        setDomainError("Domain not found.");
      }
    })();
  }, [domainId, workspaceId]);

  // ── Debounced preview ──────────────────────────────────────────────
  const fetchPreview = useCallback(
    async (sitemapUrl: string, rules: PathRule[], logic: "AND" | "OR") => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const body: Record<string, unknown> = { url: sitemapUrl, domain_id: domainId };
        const validRules = rules.filter((r) => r.value.trim() !== "");
        if (validRules.length > 0) {
          body.path_rules = validRules;
          body.path_logic = logic;
        }
        const res = await fetch("/api/contents/index/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setPreview(await res.json());
        } else {
          const err = await res.json();
          setPreviewError(
            err.error === "FETCH_FAILED"
              ? "Could not fetch sitemap. Check the URL on the domain."
              : err.error === "INVALID_SITEMAP"
                ? "Invalid sitemap format."
                : err.error ?? "Preview failed"
          );
          setPreview(null);
        }
      } catch {
        setPreviewError("Preview failed");
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [domainId, workspaceId]
  );

  useEffect(() => {
    if (!domainInfo?.sitemap_url) return;
    const timer = setTimeout(() => {
      void fetchPreview(domainInfo.sitemap_url!, pathRules, pathLogic);
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainInfo?.sitemap_url, pathRules, pathLogic]);

  // ── Path rule management ───────────────────────────────────────────
  const addPathRule = () => {
    setPathRules([...pathRules, { operator: "starts_with", value: "" }]);
  };

  const updatePathRule = (
    index: number,
    field: "operator" | "value",
    newValue: string
  ) => {
    setPathRules(
      pathRules.map((r, i) =>
        i === index ? { ...r, [field]: newValue } : r
      )
    );
  };

  const removePathRule = (index: number) => {
    setPathRules(pathRules.filter((_, i) => i !== index));
  };

  // ── Import ─────────────────────────────────────────────────────────
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
          const res = await fetch(`/api/contents/index/${jobId}`, {
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
            setTimeout(() => router.push(`/dashboard/domains/${domainId}`), 1500);
          } else if (job.status === "failed") {
            stopPolling();
            showToast(job.error_message ?? "Import failed", "error");
            setImportJob(null);
          }
        } catch {
          // Ignore, will retry
        }
      }, 2000);
    },
    [workspaceId, domainId, stopPolling, router]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleImport = async () => {
    if (!domainInfo?.sitemap_url || importJob) return;

    const validRules = pathRules.filter((r) => r.value.trim() !== "");

    try {
      const body: Record<string, unknown> = { domain_id: domainId };
      if (validRules.length > 0) {
        body.path_rules = validRules;
        body.path_logic = pathLogic;
      }
      body.max_pages = maxPages;

      const res = await fetch("/api/contents/index", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (res.ok || res.status === 202) {
        setImportJob({ id: json.jobId, status: "pending" });
        startPolling(json.jobId);
      } else if (res.status === 409) {
        showToast("An import is already running for this domain.", "error");
      } else {
        showToast(json.error ?? "Import failed", "error");
      }
    } catch {
      showToast("Import failed", "error");
    }
  };

  const isImporting = importJob !== null;
  const importStatusLabel =
    importJob?.status === "pending"
      ? "Starting import..."
      : importJob?.status === "processing"
        ? "Importing..."
        : null;

  const alreadyIndexed = domainInfo?.content_count ?? 0;
  const pagesToImport = preview
    ? Math.min(Math.max(0, preview.matched - alreadyIndexed), maxPages)
    : null;

  if (domainError) {
    return (
      <div className="max-w-2xl">
        <p className="text-red-600">{domainError}</p>
      </div>
    );
  }

  if (!domainInfo) {
    return (
      <div className="max-w-2xl">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
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

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Index Contents</h1>
      <p className="text-sm text-gray-500 mb-6">{domainInfo.domain}</p>

      <div className="space-y-6">
        {/* Sitemap info (readonly) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sitemap URL
          </label>
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 truncate">
            {domainInfo.sitemap_url ?? "—"}
          </p>
        </div>

        {/* Path filters */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Path Filters (optional)
          </label>

          {pathRules.length >= 2 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Match:</span>
              <button
                type="button"
                onClick={() =>
                  setPathLogic(pathLogic === "AND" ? "OR" : "AND")
                }
                className={`rounded-full px-3 py-0.5 text-xs font-medium ${
                  pathLogic === "AND"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-orange-100 text-orange-700"
                }`}
              >
                {pathLogic === "AND" ? "All conditions" : "Any condition"}
              </button>
            </div>
          )}

          {pathRules.map((rule, idx) => (
            <PathRuleRow
              key={idx}
              operator={rule.operator}
              value={rule.value}
              onOperatorChange={(op) => updatePathRule(idx, "operator", op)}
              onValueChange={(val) => updatePathRule(idx, "value", val)}
              onRemove={() => removePathRule(idx)}
            />
          ))}

          <button
            type="button"
            onClick={addPathRule}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add filter
          </button>
        </div>

        {/* Max pages */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New pages to index
          </label>
          <input
            type="number"
            value={maxPages}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val > 0) setMaxPages(val);
            }}
            min={1}
            className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            disabled={isImporting}
          />
          <p className="mt-1 text-xs text-gray-500">
            Maximum number of new pages to add in this import.
          </p>
        </div>

        {/* Preview panel */}
        {(preview || previewLoading || previewError) && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Preview</h3>
              {previewLoading && (
                <span className="text-xs text-blue-600">Loading...</span>
              )}
            </div>

            {previewError && (
              <p className="text-sm text-red-600">{previewError}</p>
            )}

            {preview && (
              <>
                <div className="flex gap-6 mb-3">
                  <div>
                    <span className="text-2xl font-bold text-gray-900">
                      {preview.matched}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">matched</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-gray-400">
                      {preview.total}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">total in sitemap</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-gray-400">
                      {alreadyIndexed}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">already indexed</span>
                  </div>
                  {pagesToImport !== null && (
                    <div>
                      <span className="text-2xl font-bold text-blue-600">
                        {pagesToImport}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">will be indexed</span>
                    </div>
                  )}
                </div>

                {preview.matched_urls.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-white">
                    {preview.matched_urls.map((url, i) => (
                      <div
                        key={i}
                        className="px-3 py-1.5 text-xs text-gray-700 border-b border-gray-100 last:border-b-0 truncate"
                      >
                        {url}
                      </div>
                    ))}
                    {preview.matched > preview.matched_urls.length && (
                      <div className="px-3 py-1.5 text-xs text-gray-400">
                        and {preview.matched - preview.matched_urls.length} more...
                      </div>
                    )}
                  </div>
                )}

                {preview.matched === 0 && pathRules.length > 0 && (
                  <p className="text-sm text-amber-600">
                    No URLs match the current filters. Try adjusting them.
                  </p>
                )}

              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleImport}
            loading={isImporting}
            disabled={!domainInfo.sitemap_url || isImporting}
          >
            {isImporting ? importStatusLabel : "Index contents"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push(`/dashboard/domains/${domainId}`)}
            disabled={isImporting}
          >
            Cancel
          </Button>
        </div>

        {isImporting && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
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
      </div>
    </div>
  );
}
