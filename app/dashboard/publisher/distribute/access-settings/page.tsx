"use client";

// ---------------------------------------------------------------------------
// /dashboard/publisher/distribute/access-settings
//
// Integrations list (bot-aggregated). Each row = one bot in the workspace,
// with plan / subscription / key counts. Clicking a row opens the bot detail
// page where plans + keys are managed.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

interface Bot {
  id: string;
  public_id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: "preset" | "custom";
  description: string | null;
}

interface IntegrationRow {
  bot: Bot;
  plan_count: number;
  active_subscriptions_count: number;
  active_keys_count: number;
}

export default function IntegrationsListPage() {
  const { id: workspaceId } = useWorkspace();
  const router = useRouter();
  const [items, setItems] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/integrations`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items: IntegrationRow[] };
        setItems(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchIntegrations();
  }, [fetchIntegrations]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Integrations</h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            One row per bot connected to this workspace. Click a row to manage
            its plans and the API keys consumers use at the gateway.
          </p>
        </div>
        <Button href="/dashboard/publisher/distribute/access-settings/new">
          + New integration
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 rounded-lg border border-dashed border-gray-300 bg-white">
          <p className="text-gray-500 mb-3">No bot connected yet</p>
          <Button
            variant="ghost"
            href="/dashboard/publisher/distribute/access-settings/new"
          >
            Create your first integration
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Bot</th>
                <th className="px-6 py-3 text-left font-semibold">Public ID</th>
                <th className="px-6 py-3 text-left font-semibold">Description</th>
                <th className="px-6 py-3 text-right font-semibold">Plans</th>
                <th className="px-6 py-3 text-right font-semibold">Subscriptions</th>
                <th className="px-6 py-3 text-right font-semibold">Active keys</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((row) => (
                <tr
                  key={row.bot.id}
                  className="group cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() =>
                    router.push(
                      `/dashboard/publisher/distribute/access-settings/${row.bot.public_id}`,
                    )
                  }
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {row.bot.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          row.bot.type === "preset"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-purple-50 text-purple-700"
                        }`}
                      >
                        {row.bot.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">
                    {row.bot.public_id}
                  </td>
                  <td className="px-6 py-4 text-gray-600 max-w-sm">
                    <span className="line-clamp-2 text-xs">
                      {row.bot.description ?? (
                        <span className="text-gray-400">—</span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-gray-900">
                    {row.plan_count}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-gray-900">
                    {row.active_subscriptions_count}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-gray-900">
                    {row.active_keys_count}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/publisher/distribute/access-settings/${row.bot.public_id}`}
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
