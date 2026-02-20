"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";

interface DashboardMetrics {
  contentAccessible: { covered: number; total: number; percentage: number };
  contentScraped: { scraped: number; total: number; percentage: number };
  topCatalogs: Array<{ id: string; name: string; eventCount: number }>;
  topContents: Array<{ sourceUrl: string; eventCount: number }>;
  topAgents: Array<{ name: string; eventCount: number }>;
}

const PERIODS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
] as const;

export default function DashboardOverviewPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { id: workspaceId } = useWorkspace();

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/metrics?workspace_id=${workspaceId}&period=${period}`
      );
      if (res.ok) {
        setMetrics(await res.json());
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, period]);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  const hasEvents =
    metrics &&
    (metrics.topCatalogs.length > 0 ||
      metrics.topContents.length > 0 ||
      metrics.topAgents.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p.value
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : !metrics ? (
        <div className="text-center py-12 text-gray-500">
          Failed to load metrics
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="text-sm text-gray-500">Content Accessible</div>
              <div className="mt-1 text-3xl font-bold text-gray-900">
                {metrics.contentAccessible.percentage}%
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {metrics.contentAccessible.covered} /{" "}
                {metrics.contentAccessible.total} contents covered by catalogs
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="text-sm text-gray-500">Content Scraped</div>
              <div className="mt-1 text-3xl font-bold text-gray-900">
                {metrics.contentScraped.percentage}%
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {metrics.contentScraped.scraped} /{" "}
                {metrics.contentScraped.total} contents accessed by bots
              </div>
            </div>
          </div>

          {!hasEvents ? (
            <div className="text-center py-12 rounded-lg border border-gray-200 bg-white">
              <p className="text-gray-500 mb-2">
                No bot activity detected yet
              </p>
              <a
                href="/dashboard/sdk"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Set up SDK integration
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Top Catalogs */}
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Most Valued Catalogs
                </h2>
                {metrics.topCatalogs.length === 0 ? (
                  <p className="text-sm text-gray-400">No data</p>
                ) : (
                  <ul className="space-y-2">
                    {metrics.topCatalogs.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-700 truncate">
                          {c.name}
                        </span>
                        <span className="text-gray-500 ml-2 whitespace-nowrap">
                          {c.eventCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Top Contents */}
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Most Valued Contents
                </h2>
                {metrics.topContents.length === 0 ? (
                  <p className="text-sm text-gray-400">No data</p>
                ) : (
                  <ul className="space-y-2">
                    {metrics.topContents.map((c, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-700 truncate max-w-[200px]">
                          {c.sourceUrl}
                        </span>
                        <span className="text-gray-500 ml-2 whitespace-nowrap">
                          {c.eventCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Top Agents */}
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Most Active Agents
                </h2>
                {metrics.topAgents.length === 0 ? (
                  <p className="text-sm text-gray-400">No data</p>
                ) : (
                  <ul className="space-y-2">
                    {metrics.topAgents.map((a, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-700">{a.name}</span>
                        <span className="text-gray-500 ml-2">
                          {a.eventCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
