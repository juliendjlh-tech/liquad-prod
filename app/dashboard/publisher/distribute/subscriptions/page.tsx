"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

interface SubscriptionItem {
  id: string;
  public_id: string;
  workspace_id: string;
  external_user_id: string | null;
  label: string | null;
  monthly_cap_eur: number | null;
  current_month_spent_eur: number;
  active_keys: number;
  created_at: string | null;
  archived_at: string | null;
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SubscriptionsListPage() {
  const { id: workspaceId } = useWorkspace();
  const router = useRouter();
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newExtId, setNewExtId] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/subscriptions`);
      if (res.ok) setItems((await res.json()) as SubscriptionItem[]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void fetchSubscriptions(); }, [fetchSubscriptions]);

  const createSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim() || undefined,
          external_user_id: newExtId.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Failed to create subscription");
        return;
      }
      const created = (await res.json()) as SubscriptionItem;
      router.push(`/dashboard/publisher/distribute/subscriptions/${created.public_id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-red-100 px-4 py-3 text-sm font-medium text-red-800 shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Subscriptions</h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            Spending policies that group API keys with an optional monthly cap.
            Funds come from the shared{" "}
            <a
              href="/dashboard/publisher/distribute/billing"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              workspace wallet
            </a>
            .
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New subscription</Button>
      </div>

      {/* Create subscription form (inline) */}
      {showCreate && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">New subscription</h2>
          <form onSubmit={createSubscription} className="flex flex-wrap gap-3 items-end">
            <label className="block text-sm min-w-48">
              <span className="font-medium text-gray-700">Label <span className="text-gray-400 font-normal">(optional)</span></span>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Acme Corp wallet"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm min-w-56">
              <span className="font-medium text-gray-700">External user ID <span className="text-gray-400 font-normal">(optional)</span></span>
              <input
                type="text"
                value={newExtId}
                onChange={(e) => setNewExtId(e.target.value)}
                placeholder="your-internal-id"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <div className="flex gap-2 pb-0.5">
              <Button type="submit" loading={creating}>Create</Button>
              <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); setNewLabel(""); setNewExtId(""); }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 rounded-lg border border-dashed border-gray-300 bg-white">
          <p className="text-gray-500 mb-3">No subscriptions yet</p>
          <Button variant="ghost" onClick={() => setShowCreate(true)}>
            Create your first subscription
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Label</th>
                <th className="px-6 py-3 text-left font-semibold">Public ID</th>
                <th className="px-6 py-3 text-right font-semibold">Monthly cap</th>
                <th className="px-6 py-3 text-right font-semibold">Spent this month</th>
                <th className="px-6 py-3 text-left font-semibold">Created</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((sub) => (
                <tr
                  key={sub.id}
                  className="group cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => router.push(`/dashboard/publisher/distribute/subscriptions/${sub.public_id}`)}
                >
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    {sub.label ?? <span className="text-gray-400 font-normal">—</span>}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">
                    {sub.public_id}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900 tabular-nums">
                    {sub.monthly_cap_eur === null ? (
                      <span className="text-gray-400">No cap</span>
                    ) : (
                      formatEur(sub.monthly_cap_eur)
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900 tabular-nums">
                    {formatEur(sub.current_month_spent_eur)}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {formatDate(sub.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/publisher/distribute/subscriptions/${sub.public_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
