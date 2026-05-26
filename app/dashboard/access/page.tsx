"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

interface RagQueryLog {
  id: string;
  query_text: string;
  result_count: number;
  total_cost_eur: number;
  created_at: string;
}

interface PaginatedLogs {
  items: RagQueryLog[];
  total: number;
  page: number;
  totalPages: number;
  totalResults: number;
  totalSpentEur: number;
}

const PERIOD_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
] as const;

export default function QueryHistoryTab() {
  const { id: workspaceId } = useWorkspace();
  const [logs, setLogs] = useState<PaginatedLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(30);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        days: days.toString(),
      });
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/dashboard/rag-queries?${params}`
      );
      if (res.ok) setLogs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, days]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const handlePeriodChange = (newDays: number) => {
    setDays(newDays);
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div /> {/* spacer — title is in the parent tab bar */}
        {/* Period filter */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePeriodChange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                days === opt.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : !logs || logs.items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500 mb-2">No queries in the last {days} days</p>
          <p className="text-xs text-gray-400">RAG queries made via the SDK will appear here.</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="text-xs text-gray-500">Total Queries</div>
              <div className="text-lg font-semibold text-gray-900">{logs.total}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="text-xs text-gray-500">Total Results</div>
              <div className="text-lg font-semibold text-gray-900">{logs.totalResults}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="text-xs text-gray-500">Total Spent</div>
              <div className="text-lg font-semibold text-gray-900">
                {logs.totalSpentEur.toFixed(4)} EUR
              </div>
            </div>
          </div>

          {/* Query log table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Results</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost (EUR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {logs.items.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                      {log.query_text}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{log.result_count}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {log.total_cost_eur.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {logs.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {logs.page} of {logs.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(logs.totalPages, p + 1))}
                disabled={page >= logs.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
