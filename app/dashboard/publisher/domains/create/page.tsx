"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

export default function CreateDomainPage() {
  const router = useRouter();
  const { id: workspaceId } = useWorkspace();

  const [sitemapUrl, setSitemapUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!sitemapUrl || loading) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sitemapUrl }),
      });

      const json = await res.json();

      if (res.ok) {
        router.push(`/dashboard/domains/${json.id}/import`);
      } else if (res.status === 409) {
        setError(`"${json.domain}" already exists in this organisation.`);
      } else if (res.status === 400 && json.issues) {
        setError("Invalid URL. Please enter a valid sitemap URL.");
      } else {
        setError(json.error ?? "Failed to create domain.");
      }
    } catch {
      setError("Failed to create domain.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Add a domain</h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          Paste your sitemap URL — Liquad uses it to discover the pages of
          your website that you want to protect from AI crawlers.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sitemap URL
          </label>
          <input
            type="url"
            value={sitemapUrl}
            onChange={(e) => {
              setSitemapUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            placeholder="https://example.com/sitemap.xml"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            disabled={loading}
          />
          {error && (
            <p className="mt-1 text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleCreate}
            loading={loading}
            disabled={!sitemapUrl || loading}
          >
            {loading ? "Creating..." : "Create domain"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard/domains")}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
