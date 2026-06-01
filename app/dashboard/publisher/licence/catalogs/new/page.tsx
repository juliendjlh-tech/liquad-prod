"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import DomainSelector from "@/app/components/catalog/DomainSelector";
import CatalogPreview from "@/app/components/catalog/CatalogPreview";
import type { DomainRule } from "@/lib/validations/catalog.schema";

interface BotOption {
  id: string;
  public_id: string;
  name: string;
  ua_pattern: string;
}

interface DomainWithCount {
  id: string;
  public_id: string;
  domain: string;
  content_count: number;
}

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

export default function NewCatalogPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domainRules, setDomainRules] = useState<DomainRule[]>([]);
  const [selectedBots, setSelectedBots] = useState<string[]>([]);
  const [priceEur, setPriceEur] = useState("0.00");
  const [bots, setBots] = useState<BotOption[]>([]);
  const [domains, setDomains] = useState<DomainWithCount[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const { id: workspaceId } = useWorkspace();

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch bots and domains
  useEffect(() => {
    void (async () => {
      const [botsRes, domainsRes] = await Promise.all([
        fetch(`/api/internal/workspaces/${workspaceId}/bots`),
        fetch(`/api/internal/workspaces/${workspaceId}/domains`),
      ]);
      if (botsRes.ok) {
        const data = (await botsRes.json()) as BotOption[];
        setBots(data);
      }
      if (domainsRes.ok) {
        setDomains(await domainsRes.json());
      }
    })();
  }, [workspaceId]);

  // Debounced preview
  const fetchPreview = useCallback(
    async (page: number) => {
      if (domainRules.length === 0) {
        setPreview(null);
        return;
      }
      setPreviewLoading(true);
      try {
        const res = await fetch(
          `/api/internal/workspaces/${workspaceId}/catalogs/preview?page=${page}&limit=20`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filter_rules: { domain_rules: domainRules },
            }),
          }
        );
        if (res.ok) setPreview(await res.json());
      } finally {
        setPreviewLoading(false);
      }
    },
    [domainRules, workspaceId]
  );

  useEffect(() => {
    setPreviewPage(1);
    const timer = setTimeout(() => {
      void fetchPreview(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [domainRules, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (previewPage > 1) {
      void fetchPreview(previewPage);
    }
  }, [previewPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBot = (id: string) => {
    setSelectedBots((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (domainRules.length === 0) {
      setErrors({ filter_rules: "At least one domain is required" });
      return;
    }

    const price = parseFloat(priceEur);
    if (isNaN(price) || price < 0 || price > 1) {
      setErrors({ price_eur: "Price must be between 0 and 1 EUR" });
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/catalogs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          filter_rules: { domain_rules: domainRules },
          bot_ids: selectedBots,
          price_eur: Math.round(price * 100) / 100,
        }),
      });

      if (res.ok) {
        showToast("Catalog created", "success");
        router.push("/dashboard/publisher/licence/catalogs");
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

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Create a catalog</h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          Pick the pages to include, choose which AI crawlers from your
          Watchlist are allowed, and set a price per access.
        </p>
      </div>

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

        {/* Domain Selector */}
        <DomainSelector
          domains={domains}
          domainRules={domainRules}
          onDomainRulesChange={setDomainRules}
        />
        {errors.filter_rules && (
          <p className="text-sm text-red-600">{errors.filter_rules}</p>
        )}

        {/* Preview */}
        <CatalogPreview
          preview={preview}
          loading={previewLoading}
          page={previewPage}
          onPageChange={setPreviewPage}
        />

        {/* Bots */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Authorized Bots
          </label>
          {bots.length === 0 ? (
            <p className="text-sm text-gray-500">
              No active bots. Add bots first.
            </p>
          ) : (
            <div className="space-y-2">
              {bots.map((bot) => (
                <label
                  key={bot.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedBots.includes(bot.id)}
                    onChange={() => toggleBot(bot.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-700">{bot.name}</span>
                  <span className="text-xs text-gray-400">
                    ({bot.ua_pattern})
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
          <Button type="submit" loading={submitting}>
            {submitting ? "Creating..." : "Create"}
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => router.push("/dashboard/publisher/licence/catalogs")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
