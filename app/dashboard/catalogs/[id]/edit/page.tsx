"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";

interface UserAgent {
  id: string;
  name: string;
  ua_pattern: string;
  is_active: boolean;
}

interface CatalogDetail {
  id: string;
  name: string;
  description: string | null;
  url_patterns: string[];
  price_eur: number;
  status: "active" | "inactive";
  agents: Array<{ id: string; name: string }>;
}

interface PreviewContent {
  id: string;
  source_url: string;
  title: string | null;
}

interface PreviewResult {
  matched_count: number;
  total_contents: number;
  matched_contents: PreviewContent[];
  warnings: Array<"no_match" | "too_broad">;
  page: number;
  limit: number;
  total_pages: number;
}

export default function EditCatalogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: catalogId } = use(params);
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [patternsText, setPatternsText] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [priceEur, setPriceEur] = useState("0.00");
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Preview state
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewSearch, setPreviewSearch] = useState("");

  const { id: workspaceId } = useWorkspace();

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalogs/${catalogId}`, {
        headers: { "x-workspace-id": workspaceId },
      });
      if (res.ok) {
        const data = (await res.json()) as CatalogDetail;
        setName(data.name);
        setDescription(data.description ?? "");
        setPatternsText(data.url_patterns.join("\n"));
        setSelectedAgents(data.agents.map((a) => a.id));
        setPriceEur(data.price_eur.toFixed(2));
      }
    } finally {
      setLoading(false);
    }
  }, [catalogId, workspaceId]);

  useEffect(() => {
    void fetchCatalog();
    void (async () => {
      const res = await fetch("/api/user-agents", {
        headers: { "x-workspace-id": workspaceId },
      });
      if (res.ok) {
        const data = (await res.json()) as UserAgent[];
        setAgents(data.filter((a) => a.is_active));
      }
    })();
  }, [workspaceId, fetchCatalog]);

  // Debounced live preview
  const fetchPreview = useCallback(
    async (page: number) => {
      const patterns = patternsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (patterns.length === 0) {
        setPreview(null);
        return;
      }
      setPreviewLoading(true);
      try {
        const res = await fetch(
          `/api/catalogs/preview?page=${page}&limit=20`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-workspace-id": workspaceId,
            },
            body: JSON.stringify({ url_patterns: patterns }),
          }
        );
        if (res.ok) {
          setPreview(await res.json());
        }
      } finally {
        setPreviewLoading(false);
      }
    },
    [patternsText, workspaceId]
  );

  // Debounce on patterns change — reset to page 1
  useEffect(() => {
    setPreviewPage(1);
    const timer = setTimeout(() => {
      void fetchPreview(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [patternsText, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch on page change (no debounce needed)
  useEffect(() => {
    if (previewPage > 1) {
      void fetchPreview(previewPage);
    }
  }, [previewPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const urlPatterns = patternsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const price = parseFloat(priceEur);

    try {
      const res = await fetch(`/api/catalogs/${catalogId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          name,
          description: description || undefined,
          url_patterns: urlPatterns,
          agent_ids: selectedAgents,
          price_eur: Math.round(price * 100) / 100,
        }),
      });

      if (res.ok) {
        showToast("Catalog updated", "success");
        router.push("/dashboard/catalogs");
      } else {
        const json = await res.json();
        showToast(json.error ?? "Failed to update catalog", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Filter matched contents client-side by search term
  const filteredContents = preview?.matched_contents.filter((c) => {
    if (!previewSearch) return true;
    const q = previewSearch.toLowerCase();
    return (
      c.source_url.toLowerCase().includes(q) ||
      (c.title && c.title.toLowerCase().includes(q))
    );
  });

  // Extract domain from source_url for display
  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
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

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Catalog</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL Patterns (one regex per line)
          </label>
          <textarea
            value={patternsText}
            onChange={(e) => setPatternsText(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Authorized Bots
          </label>
          <div className="space-y-2">
            {agents.map((agent) => (
              <label
                key={agent.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedAgents.includes(agent.id)}
                  onChange={() => toggleAgent(agent.id)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">{agent.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Price (EUR, 0-1)
          </label>
          <input
            type="number"
            value={priceEur}
            onChange={(e) => setPriceEur(e.target.value)}
            min="0"
            max="1"
            step="0.01"
            className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/catalogs")}
            className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Matched Contents Section */}
      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">
            Matched Contents
            {preview && !previewLoading && (
              <span className="ml-1 text-gray-500">
                ({preview.matched_count})
              </span>
            )}
          </h2>
          {previewLoading && (
            <span className="text-xs text-gray-400">Loading...</span>
          )}
        </div>

        {/* Warnings */}
        {preview?.warnings.map((w) => (
          <div
            key={w}
            className="text-sm text-yellow-700 bg-yellow-50 rounded px-3 py-2 mb-3"
          >
            {w === "no_match"
              ? "No content matches these patterns"
              : "These patterns match more than 80% of your content"}
          </div>
        ))}

        {/* Search */}
        {preview && preview.matched_count > 0 && (
          <input
            type="text"
            placeholder="Search by URL or title..."
            value={previewSearch}
            onChange={(e) => setPreviewSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3"
          />
        )}

        {/* Content List */}
        {!preview && !previewLoading && (
          <p className="text-sm text-gray-500">
            Add URL patterns above to see matched contents.
          </p>
        )}

        {filteredContents && filteredContents.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredContents.map((c) => (
              <div
                key={c.id}
                className="rounded border border-gray-200 bg-white px-3 py-2"
              >
                <div className="text-xs text-blue-600 truncate">
                  {c.source_url}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {c.title && (
                    <span className="text-xs text-gray-700 truncate">
                      {c.title}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {getDomain(c.source_url)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredContents &&
          filteredContents.length === 0 &&
          preview &&
          preview.matched_count > 0 && (
            <p className="text-sm text-gray-500">
              No contents match your search.
            </p>
          )}

        {/* Pagination */}
        {preview && preview.total_pages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
              disabled={previewPage <= 1}
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
                setPreviewPage((p) => Math.min(preview.total_pages, p + 1))
              }
              disabled={previewPage >= preview.total_pages}
              className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
