"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";

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
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPattern, setCustomPattern] = useState("");
  const [customDnsPatterns, setCustomDnsPatterns] = useState("");

  /** Which bot ID is currently being edited for dns_patterns (null = none) */
  const [editingDnsPatterns, setEditingDnsPatterns] = useState<string | null>(null);
  /** Temporary value for the dns_patterns editor */
  const [editDnsValue, setEditDnsValue] = useState("");

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
      setShowAddPreset(false);
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
    const res = await fetch(`/api/user-agents/${agent.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ is_active: !agent.is_active }),
    });
    if (res.ok) void fetchAgents();
  };

  const deleteAgent = async (agent: UserAgent) => {
    if (!confirm(`Delete ${agent.name}?`)) return;

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
  };

  const startEditDns = (agent: UserAgent) => {
    setEditingDnsPatterns(agent.id);
    setEditDnsValue(agent.dns_patterns.join(", "));
  };

  const saveDnsPatterns = async (agentId: string) => {
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
      body: JSON.stringify({ dns_patterns: newPatterns }),
    });

    if (res.ok) {
      showToast("DNS patterns updated", "success");
      setEditingDnsPatterns(null);
      setEditDnsValue("");
      void fetchAgents();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to update DNS patterns", "error");
    }
  };

  // Filter presets not already added
  const availablePresets = presets.filter(
    (p) => !agents.some((a) => a.name === p.name)
  );

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
          <button
            onClick={() => setShowAddPreset(!showAddPreset)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add AI Bot
          </button>
          <button
            onClick={() => setShowAddCustom(!showAddCustom)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Add Custom Bot
          </button>
        </div>
      </div>

      {/* Add preset dropdown */}
      {showAddPreset && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Select a bot to add
          </h3>
          {availablePresets.length === 0 ? (
            <p className="text-sm text-gray-500">
              All preset bots have been added.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {availablePresets.map((p) => (
                <button
                  key={p.name}
                  onClick={() => addPresetBot(p)}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-blue-50 hover:border-blue-300 text-left"
                >
                  <div className="font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.operator}</div>
                  {p.dns_patterns.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.dns_patterns.map((dp) => (
                        <span
                          key={dp}
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                        >
                          {dp}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {/* Bot list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No AI bots declared</p>
          <button
            onClick={() => setShowAddPreset(true)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Add your first bot
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              {/* Top row: name + controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {agent.name}
                      </span>
                      {agent.is_preset && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          Preset
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {agent.ua_pattern}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleActive(agent)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      agent.is_active ? "bg-blue-600" : "bg-gray-300"
                    }`}
                    title={agent.is_active ? "Active" : "Inactive"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        agent.is_active ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => deleteAgent(agent)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* DNS Patterns row */}
              <div className="mt-2 flex items-start gap-2">
                <span className="text-xs text-gray-400 mt-0.5 shrink-0">
                  DNS:
                </span>
                {editingDnsPatterns === agent.id ? (
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={editDnsValue}
                      onChange={(e) => setEditDnsValue(e.target.value)}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                      placeholder="*.example.com, *.example.net"
                      autoFocus
                    />
                    <button
                      onClick={() => saveDnsPatterns(agent.id)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingDnsPatterns(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
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
                    <button
                      onClick={() => startEditDns(agent)}
                      className="ml-1 text-xs text-gray-400 hover:text-blue-600"
                      title="Edit DNS patterns"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
