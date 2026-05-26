"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

interface NetworkRow {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export default function NetworksPage() {
  const { id: workspaceId } = useWorkspace();
  const router = useRouter();
  const [networks, setNetworks] = useState<NetworkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNetworks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/networks`);
      if (res.ok) setNetworks(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchNetworks();
  }, [fetchNetworks]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Networks</h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          Bundles of catalogues you offer to consumers under a single API key.
          Invite catalogues from your workspace or other publishers — the owner
          must accept before the catalogue becomes active in the network.
        </p>
      </div>

      <div className="mb-6 flex justify-end items-center gap-2">
        <span className="text-sm text-gray-500">
          {networks.length} network{networks.length !== 1 ? "s" : ""}
        </span>
        <Button onClick={() => router.push("/dashboard/publisher/networks/new")}>
          New network
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : networks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No networks yet</p>
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/publisher/networks/new")}
          >
            Create your first network
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {networks.map((n) => (
            <button
              key={n.id}
              onClick={() => router.push(`/dashboard/publisher/networks/${n.id}`)}
              className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4 text-left hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {n.name}
                  </div>
                  {n.description && (
                    <div className="mt-0.5 text-xs text-gray-500 truncate max-w-lg">
                      {n.description}
                    </div>
                  )}
                  <div className="mt-0.5 text-xs text-gray-400 font-mono">
                    {n.public_id}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-gray-400">
                  Updated {new Date(n.updated_at).toLocaleDateString()}
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
