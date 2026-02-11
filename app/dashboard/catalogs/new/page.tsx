"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface UserAgent {
  id: string;
  name: string;
  ua_pattern: string;
  is_active: boolean;
}

interface PreviewResult {
  matched_contents: Array<{ source_url: string }>;
  total: number;
  warnings: string[];
}

export default function NewCatalogPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [patternsText, setPatternsText] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [priceEur, setPriceEur] = useState("0.00");
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
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

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch agents for checkboxes
  useEffect(() => {
    if (!workspaceId) return;
    void (async () => {
      const res = await fetch("/api/user-agents", {
        headers: { "x-workspace-id": workspaceId },
      });
      if (res.ok) {
        const data = (await res.json()) as UserAgent[];
        setAgents(data.filter((a) => a.is_active));
      }
    })();
  }, [workspaceId]);

  // Debounced preview
  const fetchPreview = useCallback(async () => {
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
      const res = await fetch("/api/catalogs/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ url_patterns: patterns }),
      });
      if (res.ok) setPreview(await res.json());
    } finally {
      setPreviewLoading(false);
    }
  }, [patternsText, workspaceId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchPreview();
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchPreview]);

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const urlPatterns = patternsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (urlPatterns.length === 0) {
      setErrors({ url_patterns: "At least one pattern is required" });
      return;
    }

    const price = parseFloat(priceEur);
    if (isNaN(price) || price < 0 || price > 1) {
      setErrors({ price_eur: "Price must be between 0 and 1 EUR" });
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/catalogs", {
        method: "POST",
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
        showToast("Catalog created", "success");
        router.push("/dashboard/catalogs");
      } else {
        const json = await res.json();
        showToast(json.error ?? "Failed to create catalog", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

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

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Catalog</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
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

        {/* Description */}
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

        {/* URL Patterns */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL Patterns (one regex per line)
          </label>
          <textarea
            value={patternsText}
            onChange={(e) => setPatternsText(e.target.value)}
            rows={4}
            placeholder={"/premium/.*\n/vip/.*"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
          />
          {errors.url_patterns && (
            <p className="mt-1 text-sm text-red-600">{errors.url_patterns}</p>
          )}
        </div>

        {/* Preview */}
        {preview && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">
              Preview: {preview.total} contents match
            </div>
            {preview.warnings.map((w, i) => (
              <div
                key={i}
                className="text-sm text-yellow-700 bg-yellow-50 rounded px-2 py-1 mb-1"
              >
                {w}
              </div>
            ))}
            {preview.matched_contents.length > 0 && (
              <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {preview.matched_contents.map((c, i) => (
                  <li key={i} className="text-xs text-gray-600 truncate">
                    {c.source_url}
                  </li>
                ))}
              </ul>
            )}
            {previewLoading && (
              <span className="text-xs text-gray-400">Refreshing...</span>
            )}
          </div>
        )}

        {/* Agents */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Authorized Bots
          </label>
          {agents.length === 0 ? (
            <p className="text-sm text-gray-500">
              No active bots. Add bots first.
            </p>
          ) : (
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
                  <span className="text-xs text-gray-400">
                    ({agent.ua_pattern})
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Price */}
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
          {errors.price_eur && (
            <p className="mt-1 text-sm text-red-600">{errors.price_eur}</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create"}
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
    </div>
  );
}
