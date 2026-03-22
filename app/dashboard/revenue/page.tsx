"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";

type Period = "7d" | "30d" | "90d";

interface RevenueData {
  total_revenue_eur: number;
  total_paid_accesses: number;
  top_contents: Array<{ url: string; access_count: number; total_eur: number }>;
  top_consumers: Array<{ workspace_id: string; total_eur: number }>;
}

export default function RevenuePage() {
  const { id: workspaceId } = useWorkspace();
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/revenue?period=${period}`
      );
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, period]);

  useEffect(() => {
    void fetchRevenue();
  }, [fetchRevenue]);

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Revenue</h1>
        <div className="flex gap-1 rounded-lg border border-gray-200 p-1">
          {(["7d", "30d", "90d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === p
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Total revenue</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {data?.total_revenue_eur?.toFixed(2) ?? "0.00"} EUR
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Paid accesses</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {data?.total_paid_accesses ?? 0}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Tracked revenue. Manual payout.
      </p>

      {data?.total_paid_accesses === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No revenue yet</p>
          <p className="mt-1 text-sm text-gray-400">
            Revenue will appear here when AI bots access your paid content.
          </p>
        </div>
      ) : (
        <>
          {/* Top Contents */}
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Top contents
            </h2>
            {data?.top_contents && data.top_contents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500">
                      <th className="pb-2 font-medium">URL</th>
                      <th className="pb-2 font-medium text-right">Accesses</th>
                      <th className="pb-2 font-medium text-right">
                        Total EUR
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_contents.map((item, i) => (
                      <tr
                        key={i}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-2 text-gray-700 truncate max-w-xs">
                          {item.url}
                        </td>
                        <td className="py-2 text-right text-gray-600">
                          {item.access_count}
                        </td>
                        <td className="py-2 text-right font-medium text-gray-900">
                          {item.total_eur.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No data.</p>
            )}
          </section>

          {/* Top Consumers */}
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Top consumers
            </h2>
            {data?.top_consumers && data.top_consumers.length > 0 ? (
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
                    {data.top_consumers.map((item, i) => (
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
            ) : (
              <p className="text-sm text-gray-500">No data.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
