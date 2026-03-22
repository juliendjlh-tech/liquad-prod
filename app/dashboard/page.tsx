"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardMetrics {
  contentAccessible: { covered: number; total: number; percentage: number };
  contentScraped: { scraped: number; total: number; percentage: number };
  topCatalogs: Array<{ id: string; name: string; eventCount: number }>;
  topContents: Array<{ sourceUrl: string; eventCount: number }>;
  topAgents: Array<{ name: string; eventCount: number }>;

  identityCheck?: {
    blockedCount: number;
    verifiedCount: number;
    unverifiedCount: number;
    topFailedAgents: Array<{ name: string; failCount: number }>;
  };
}

interface RevenueData {
  total_revenue_eur: number;
  total_paid_accesses: number;
  top_contents: Array<{ url: string; access_count: number; total_eur: number }>;
  top_consumers: Array<{ workspace_id: string; total_eur: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIODS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
] as const;

// ---------------------------------------------------------------------------
// Dashboard Overview Page
// ---------------------------------------------------------------------------

export default function DashboardOverviewPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { id: workspaceId } = useWorkspace();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, revenueRes] = await Promise.all([
        fetch(
          `/api/dashboard/metrics?workspace_id=${workspaceId}&period=${period}`
        ),
        fetch(
          `/api/workspaces/${workspaceId}/revenue?period=${period}d`
        ),
      ]);
      if (metricsRes.ok) {
        setMetrics(await metricsRes.json());
      }
      if (revenueRes.ok) {
        setRevenue(await revenueRes.json());
      }
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [workspaceId, period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const hasEvents =
    metrics &&
    (metrics.topCatalogs.length > 0 ||
      metrics.topContents.length > 0 ||
      metrics.topAgents.length > 0);

  const hasIcActivity =
    metrics?.identityCheck &&
    (metrics.identityCheck.blockedCount > 0 ||
      metrics.identityCheck.verifiedCount > 0 ||
      metrics.identityCheck.unverifiedCount > 0);

  // Build merged top contents: combine eventCount from metrics + revenue from revenue API
  const mergedTopContents = (() => {
    if (!metrics) return [];
    const revenueByUrl = new Map<string, { access_count: number; total_eur: number }>();
    if (revenue?.top_contents) {
      for (const rc of revenue.top_contents) {
        revenueByUrl.set(rc.url, { access_count: rc.access_count, total_eur: rc.total_eur });
      }
    }
    return metrics.topContents.map((c) => {
      const rev = revenueByUrl.get(c.sourceUrl);
      return {
        sourceUrl: c.sourceUrl,
        eventCount: c.eventCount,
        totalEur: rev?.total_eur ?? null,
      };
    });
  })();

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
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
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="text-sm text-gray-500">Total Revenue</div>
              <div className="mt-1 text-3xl font-bold text-gray-900">
                {revenue?.total_revenue_eur?.toFixed(2) ?? "0.00"} EUR
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Tracked revenue. Manual payout.
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="text-sm text-gray-500">Paid Accesses</div>
              <div className="mt-1 text-3xl font-bold text-gray-900">
                {revenue?.total_paid_accesses ?? 0}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Content accessed by paying bots
              </div>
            </div>
          </div>

          {/* Identity Check Metrics */}
          {hasIcActivity && metrics.identityCheck && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                Identity Check
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="text-xs text-red-600 font-medium">
                    Blocked by IC
                  </div>
                  <div className="mt-1 text-2xl font-bold text-red-700">
                    {metrics.identityCheck.blockedCount}
                  </div>
                  <div className="mt-0.5 text-xs text-red-500">
                    Spoofed bots denied
                  </div>
                </div>

                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="text-xs text-green-600 font-medium">
                    Verified
                  </div>
                  <div className="mt-1 text-2xl font-bold text-green-700">
                    {metrics.identityCheck.verifiedCount}
                  </div>
                  <div className="mt-0.5 text-xs text-green-500">
                    Bot identity confirmed via DNS
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs text-amber-600 font-medium">
                    Unverified
                  </div>
                  <div className="mt-1 text-2xl font-bold text-amber-700">
                    {metrics.identityCheck.unverifiedCount}
                  </div>
                  <div className="mt-0.5 text-xs text-amber-500">
                    DNS verification failed
                  </div>
                </div>
              </div>

              {metrics.identityCheck.topFailedAgents.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">
                    Top Agents Blocked by Identity Check
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Bots that failed DNS verification most often — potential
                    spoofers.
                  </p>
                  <ul className="space-y-1.5">
                    {metrics.identityCheck.topFailedAgents.map((a, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-700">{a.name}</span>
                        <span className="text-red-600 font-medium ml-2">
                          {a.failCount} blocked
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!hasEvents ? (
            <div className="text-center py-12 rounded-lg border border-gray-200 bg-white">
              <p className="text-gray-500 mb-2">
                No bot activity detected yet
              </p>
              <a
                href="/dashboard/integration"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Set up SDK integration
              </a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-8">
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

                {/* Top Contents (merged: eventCount + revenue) */}
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3">
                    Most Valued Contents
                  </h2>
                  {mergedTopContents.length === 0 ? (
                    <p className="text-sm text-gray-400">No data</p>
                  ) : (
                    <ul className="space-y-2">
                      {mergedTopContents.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-700 truncate max-w-[180px]">
                            {c.sourceUrl}
                          </span>
                          <span className="text-gray-500 ml-2 whitespace-nowrap">
                            {c.eventCount}
                            {c.totalEur !== null && (
                              <span className="text-green-600 ml-1.5">
                                {c.totalEur.toFixed(2)}€
                              </span>
                            )}
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

              {/* Top Consumers */}
              {revenue?.top_consumers && revenue.top_consumers.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="text-sm font-semibold text-gray-900 mb-4">
                    Top Consumers
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-gray-500">
                          <th className="pb-2 font-medium">Workspace ID</th>
                          <th className="pb-2 font-medium text-right">
                            Total EUR
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenue.top_consumers.map((item, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                          >
                            <td className="py-2 font-mono text-xs text-gray-600">
                              {item.workspace_id}
                            </td>
                            <td className="py-2 text-right font-medium text-gray-900">
                              {item.total_eur.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
