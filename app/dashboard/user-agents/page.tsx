"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import DropdownMenu from "@/app/components/ui/DropdownMenu";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Agent {
  id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  created_at: string;
}

interface Preset {
  name: string;
  ua_pattern: string;
  operator: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// User Agents Page Component
// ---------------------------------------------------------------------------

export default function UserAgentsPage() {
  const { id: workspaceId } = useWorkspace();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPattern, setCustomPattern] = useState("");

  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPattern, setEditPattern] = useState("");

  const [confirmTarget, setConfirmTarget] = useState<Agent | null>(null);
  const [filter, setFilter] = useState<"all" | "preset" | "custom">("all");
  const [search, setSearch] = useState("");

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user-agents", {
        headers: { "x-workspace-id": workspaceId },
      });
      if (res.ok) setAgents(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchPresets = useCallback(async () => {
    const res = await fetch("/api/user-agents/presets");
    if (res.ok) setPresets(await res.json());
  }, []);

  useEffect(() => {
    void fetchAgents();
    void fetchPresets();
  }, [fetchAgents, fetchPresets]);

  // ---------------------------------------------------------------------------
  // Add / Remove Agents
  // ---------------------------------------------------------------------------

  const addPresetBot = async (preset: Preset) => {
    const res = await fetch("/api/user-agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({
        name: preset.name,
        ua_pattern: preset.ua_pattern,
      }),
    });

    if (res.ok) {
      showToast(`${preset.name} added`, "success");
      void fetchAgents();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to add bot", "error");
    }
  };

  const addCustomBot = async (e: React.FormEvent) => {
    e.preventDefault();

    const res = await fetch("/api/user-agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({
        name: customName,
        ua_pattern: customPattern,
      }),
    });

    if (res.ok) {
      showToast("Custom bot added", "success");
      setShowAddCustom(false);
      setCustomName("");
      setCustomPattern("");
      void fetchAgents();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to add bot", "error");
    }
  };

  const removeAgent = async (agent: Agent) => {
    const res = await fetch(`/api/user-agents/${agent.id}`, {
      method: "DELETE",
      headers: { "x-workspace-id": workspaceId },
    });

    if (res.ok) {
      const json = await res.json();
      const warning = json.warning ? ` — ${json.warning}` : "";
      showToast(`${agent.name} removed${warning}`, "success");
      void fetchAgents();
    }
    setConfirmTarget(null);
  };

  // ---------------------------------------------------------------------------
  // Edit
  // ---------------------------------------------------------------------------

  const startEdit = (agent: Agent) => {
    setEditingAgent(agent.id);
    setEditName(agent.name);
    setEditPattern(agent.ua_pattern);
  };

  const cancelEdit = () => {
    setEditingAgent(null);
    setEditName("");
    setEditPattern("");
  };

  const saveEdit = async (agentId: string) => {
    const res = await fetch(`/api/user-agents/${agentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({
        name: editName,
        ua_pattern: editPattern,
      }),
    });

    if (res.ok) {
      showToast("Bot updated", "success");
      cancelEdit();
      void fetchAgents();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to update bot", "error");
    }
  };

  // ---------------------------------------------------------------------------
  // Preset toggle (add if not in workspace, remove if present)
  // ---------------------------------------------------------------------------

  const handlePresetToggle = async (
    preset: Preset,
    agent: Agent | undefined
  ) => {
    if (!agent) {
      await addPresetBot(preset);
    } else {
      setConfirmTarget(agent);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const presetNames = new Set(presets.map((p) => p.name));
  const isPresetAgent = (a: Agent) => presetNames.has(a.name);

  const allPresetItems = presets.map((p) => ({
    preset: p,
    agent: agents.find((a) => a.name === p.name),
    isPreset: true as const,
  }));

  const customItems = agents
    .filter((a) => !isPresetAgent(a))
    .map((a) => ({ agent: a, isPreset: false as const }));

  const allItems = [...allPresetItems, ...customItems];

  const q = search.toLowerCase().trim();

  const matchesSearch = (item: (typeof allItems)[number]) => {
    if (!q) return true;
    if (item.isPreset) {
      const { preset } = item;
      return (
        preset.name.toLowerCase().includes(q) ||
        preset.ua_pattern.toLowerCase().includes(q) ||
        (preset.description?.toLowerCase().includes(q) ?? false)
      );
    }
    const { agent } = item;
    return (
      agent.name.toLowerCase().includes(q) ||
      agent.ua_pattern.toLowerCase().includes(q)
    );
  };

  const visibleItems = (
    filter === "preset"
      ? allPresetItems
      : filter === "custom"
      ? customItems
      : allItems
  ).filter(matchesSearch);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
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

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Bots</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddCustom(!showAddCustom)}>
            Add Custom Bot
          </Button>
        </div>
      </div>

      {/* Add custom form */}
      {showAddCustom && (
        <form
          onSubmit={addCustomBot}
          className="mb-4 rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. MyBot"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User-Agent Pattern
              </label>
              <input
                type="text"
                value={customPattern}
                onChange={(e) => setCustomPattern(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. MyBot/1.0"
                required
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit">Save</Button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, UA pattern, description..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-4">
        {(["all", "preset", "custom"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            {f === "all" ? "All" : f === "preset" ? "Preset" : "Custom"}
          </button>
        ))}
      </div>

      {/* Bot list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : visibleItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No bots match your search.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => {
            if (item.isPreset) {
              const { preset, agent } = item;
              const isActive = !!agent;
              return (
                <div
                  key={preset.name}
                  className={`group rounded-lg border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition-colors ${
                    !isActive ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {preset.name}
                          </span>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                            Preset
                          </span>
                          {isActive && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {preset.ua_pattern}
                        </span>
                        {preset.description && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {preset.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmTarget(agent)}
                        >
                          Remove
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handlePresetToggle(preset, agent)}
                        >
                          Add
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            // Custom bot
            const { agent } = item;
            return (
              <div
                key={agent.id}
                className="group rounded-lg border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                {editingAgent === agent.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          User-Agent Pattern
                        </label>
                        <input
                          type="text"
                          value={editPattern}
                          onChange={(e) => setEditPattern(e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(agent.id)}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {agent.name}
                      </span>
                      <div>
                        <span className="text-xs text-gray-500">
                          {agent.ua_pattern}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu
                          items={[
                            { label: "Edit", onClick: () => startEdit(agent) },
                            {
                              label: "Remove",
                              onClick: () => setConfirmTarget(agent),
                              variant: "danger" as const,
                              separator: true,
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        title={`Remove ${confirmTarget?.name ?? "bot"}?`}
        description="This will remove the bot from your workspace and unlink it from all associated catalogs."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => confirmTarget && removeAgent(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
