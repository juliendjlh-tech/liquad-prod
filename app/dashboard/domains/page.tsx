"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

interface DomainItem {
  id: string;
  domain: string;
  status: string;
  content_count: number;
}

export default function DomainsPage() {
  const { id: workspaceId } = useWorkspace();
  const router = useRouter();

  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [domainSearch, setDomainSearch] = useState("");
  const [domainsLoading, setDomainsLoading] = useState(true);

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

  const totalContents = domains.reduce((sum, d) => sum + d.content_count, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Domains</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {domains.length} domain(s) &middot; {totalContents} content(s)
          </span>
          <Button onClick={() => router.push("/dashboard/domains/create")}>
            Add domain
          </Button>
        </div>
      </div>

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
            Add a domain by importing a sitemap.xml
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => (
            <button
              key={d.id}
              onClick={() => router.push(`/dashboard/domains/${d.id}`)}
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
    </div>
  );
}
