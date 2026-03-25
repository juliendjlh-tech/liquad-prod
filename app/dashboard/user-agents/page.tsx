"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import DropdownMenu from "@/app/components/ui/DropdownMenu";
import Toggle from "@/app/components/ui/Toggle";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserAgent {
  id: string;
  name: string;
  ua_pattern: string;
  is_active: boolean;
  is_preset: boolean;
  /** DNS hostname glob patterns for Identity Check verification */
  dns_patterns: string[];
}

interface Preset {
  name: string;
  ua_pattern: string;
  operator: string;
  /** Pre-filled DNS patterns from the preset definition */
  dns_patterns: string[];
  /** Optional official bot usage description */
  description?: string;
}

// ---------------------------------------------------------------------------
// User Agents Page Component
// ---------------------------------------------------------------------------

/**
 * Dashboard User-Agents (AI Bots) Management Page
 *
 * Features:
 * - List all bots in the workspace with their dns_patterns as tags
 * - Add preset bots (with pre-filled dns_patterns from the server)
 * - Add custom bots (with optional dns_patterns)
 * - Toggle bot active/inactive
 * - Inline edit dns_patterns on existing bots
 * - Delete bots
 */
export default function UserAgentsPage() {
  const { id: workspaceId } = useWorkspace();
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPattern, setCustomPattern] = useState("");
  const [customDnsPatterns, setCustomDnsPatterns] = useState("");

  /** Which bot ID is currently being edited (null = none) */
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  /** Temporary values for the editor */
  const [editName, setEditName] = useState("");
  const [editPattern, setEditPattern] = useState("");
  const [editDnsValue, setEditDnsValue] = useState("");

  const [confirmTarget, setConfirmTarget] = useState<UserAgent | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
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
  // Add Bots
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
        is_preset: true,
        dns_patterns: preset.dns_patterns,
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
    const dnsPatterns = customDnsPatterns
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const res = await fetch("/api/user-agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({
        name: customName,
        ua_pattern: customPattern,
        is_preset: false,
        dns_patterns: dnsPatterns,
      }),
    });

    if (res.ok) {
      showToast("Custom bot added", "success");
      setShowAddCustom(false);
      setCustomName("");
      setCustomPattern("");
      setCustomDnsPatterns("");
      void fetchAgents();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to add bot", "error");
    }
  };

  // ---------------------------------------------------------------------------
  // Toggle / Delete / Edit DNS Patterns
  // ---------------------------------------------------------------------------

  const toggleActive = async (agent: UserAgent) => {
    const wasActive = agent.is_active;
    setTogglingId(agent.id);
    try {
      const res = await fetch(`/api/user-agents/${agent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ is_active: !agent.is_active }),
      });
      if (res.ok) {
        showToast(
          wasActive ? "Bot deactivated" : "Bot activated",
          "success"
        );
        void fetchAgents();
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handlePresetToggle = async (
    preset: Preset,
    agent: UserAgent | undefined
  ) => {
    if (!agent) {
      await addPresetBot(preset);
    } else {
      await toggleActive(agent);
    }
  };

  const duplicateAgent = async (agent: UserAgent) => {
    const res = await fetch(`/api/user-agents/${agent.id}/duplicate`, {
      method: "POST",
      headers: { "x-workspace-id": workspaceId },
    });

    if (res.ok) {
      const created = await res.json();
      showToast(`Duplicated as "${created.name}"`, "success");
      void fetchAgents();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to duplicate bot", "error");
    }
  };

  const handleDuplicatePreset = async (
    preset: Preset,
    agent: UserAgent | undefined
  ) => {
    if (agent) {
      await duplicateAgent(agent);
      return;
    }
    // Preset not in workspace yet — create it first, then duplicate
    const createRes = await fetch("/api/user-agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({
        name: preset.name,
        ua_pattern: preset.ua_pattern,
        is_preset: true,
        dns_patterns: preset.dns_patterns,
      }),
    });
    if (!createRes.ok) {
      const json = await createRes.json();
      showToast(json.error ?? "Failed to duplicate bot", "error");
      return;
    }
    const created: UserAgent = await createRes.json();
    await duplicateAgent(created);
  };

  const executeDelete = async (agent: UserAgent) => {
    const res = await fetch(`/api/user-agents/${agent.id}`, {
      method: "DELETE",
      headers: { "x-workspace-id": workspaceId },
    });

    if (res.ok) {
      const json = await res.json();
      const warning =
        json.catalogCount > 0
          ? ` (removed from ${json.catalogCount} catalog(s))`
          : "";
      showToast(`Bot deleted${warning}`, "success");
      void fetchAgents();
    }
    setConfirmTarget(null);
  };

  const startEdit = (agent: UserAgent) => {
    setEditingAgent(agent.id);
    setEditName(agent.name);
    setEditPattern(agent.ua_pattern);
    setEditDnsValue(agent.dns_patterns.join(", "));
  };

  const cancelEdit = () => {
    setEditingAgent(null);
    setEditName("");
    setEditPattern("");
    setEditDnsValue("");
  };

  const saveEdit = async (agentId: string) => {
    const newPatterns = editDnsValue
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const res = await fetch(`/api/user-agents/${agentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({
        name: editName,
        ua_pattern: editPattern,
        dns_patterns: newPatterns,
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

  // All preset items paired with their workspace agent if one exists
  const allPresetItems = presets.map((p) => ({
    preset: p,
    agent: agents.find((a) => a.name === p.name && a.is_preset),
    isPreset: true as const,
  }));

  // Custom bots (non-preset) declared in this workspace
  const customItems = agents
    .filter((a) => !a.is_preset)
    .map((a) => ({ agent: a, isPreset: false as const }));

  // Unified list filtered by selection
  const allItems = [
    ...allPresetItems,
    ...customItems,
  ];

  const q = search.toLowerCase().trim();

  const matchesSearch = (item: (typeof allItems)[number]) => {
    if (!q) return true;
    if (item.isPreset) {
      const { preset, agent } = item;
      return (
        preset.name.toLowerCase().includes(q) ||
        preset.ua_pattern.toLowerCase().includes(q) ||
        (preset.description?.toLowerCase().includes(q) ?? false) ||
        preset.dns_patterns.some((dp) => dp.toLowerCase().includes(q)) ||
        (agent?.dns_patterns.some((dp) => dp.toLowerCase().includes(q)) ?? false)
      );
    }
    const { agent } = item;
    return (
      agent.name.toLowerCase().includes(q) ||
      agent.ua_pattern.toLowerCase().includes(q) ||
      agent.dns_patterns.some((dp) => dp.toLowerCase().includes(q))
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
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              DNS Patterns{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={customDnsPatterns}
              onChange={(e) => setCustomDnsPatterns(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. *.mybot.com, *.mybot.net"
            />
            <p className="mt-1 text-xs text-gray-400">
              Comma-separated hostname globs for Identity Check verification.
              Leave empty to skip IC for this bot.
            </p>
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
          placeholder="Search by name, UA, domain, description…"
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
              return (
                <div
                  key={preset.name}
                  className="group rounded-lg border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition-colors"
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
                      <Toggle
                        checked={agent?.is_active ?? false}
                        onChange={() => handlePresetToggle(preset, agent)}
                        loading={agent ? togglingId === agent.id : false}
                        label={`Toggle ${preset.name} ${agent?.is_active ? "off" : "on"}`}
                      />
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu
                          items={[
                            {
                              label: "Duplicate",
                              onClick: () => handleDuplicatePreset(preset, agent),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-start gap-2">
                    <span className="text-xs text-gray-400 mt-0.5 shrink-0">DNS:</span>
                    <div className="flex-1 flex items-center gap-1 flex-wrap">
                      {preset.dns_patterns.length > 0 ? (
                        preset.dns_patterns.map((dp) => (
                          <span
                            key={dp}
                            className="rounded bg-purple-50 border border-purple-200 px-1.5 py-0.5 text-xs text-purple-700"
                          >
                            {dp}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 italic">
                          No DNS patterns (IC skipped)
                        </span>
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
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        DNS Patterns
                      </label>
                      <input
                        type="text"
                        value={editDnsValue}
                        onChange={(e) => setEditDnsValue(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                        placeholder="*.example.com, *.example.net"
                      />
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
                  <>
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
                        <Toggle
                          checked={agent.is_active}
                          onChange={() => toggleActive(agent)}
                          loading={togglingId === agent.id}
                          label={`Toggle ${agent.name} ${agent.is_active ? "off" : "on"}`}
                        />
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu
                            items={[
                              { label: "Edit", onClick: () => startEdit(agent) },
                              { label: "Duplicate", onClick: () => duplicateAgent(agent) },
                              {
                                label: "Delete",
                                onClick: () => setConfirmTarget(agent),
                                variant: "danger" as const,
                                separator: true,
                              },
                            ]}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-start gap-2">
                      <span className="text-xs text-gray-400 mt-0.5 shrink-0">DNS:</span>
                      <div className="flex-1 flex items-center gap-1 flex-wrap">
                        {agent.dns_patterns.length > 0 ? (
                          agent.dns_patterns.map((dp) => (
                            <span
                              key={dp}
                              className="rounded bg-purple-50 border border-purple-200 px-1.5 py-0.5 text-xs text-purple-700"
                            >
                              {dp}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400 italic">
                            No DNS patterns (IC skipped)
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        title={`Delete ${confirmTarget?.name ?? "bot"}?`}
        description="This action cannot be undone. The bot will be permanently deleted and removed from all associated catalogs."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmTarget && executeDelete(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
