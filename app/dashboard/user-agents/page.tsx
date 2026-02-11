"use client";

import { useState, useEffect, useCallback } from "react";

interface UserAgent {
  id: string;
  name: string;
  ua_pattern: string;
  is_active: boolean;
  is_preset: boolean;
}

interface Preset {
  name: string;
  ua_pattern: string;
}

export default function UserAgentsPage() {
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPattern, setCustomPattern] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const workspaceId =
    typeof window !== "undefined"
      ? document.cookie
          .split("; ")
          .find((c) => c.startsWith("workspace_id="))
          ?.split("=")[1] ?? ""
      : "";

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
    if (workspaceId) {
      void fetchAgents();
      void fetchPresets();
    }
  }, [workspaceId, fetchAgents, fetchPresets]);

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
    const msg = `Delete ${agent.name}?`;
    if (!confirm(msg)) return;

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

  // Filter presets not already added
  const availablePresets = presets.filter(
    (p) => !agents.some((a) => a.name === p.name)
  );

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
      {showAddPreset && availablePresets.length > 0 && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            Select a preset bot
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {availablePresets.map((p) => (
              <button
                key={p.name}
                onClick={() => addPresetBot(p)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-blue-50 hover:border-blue-300"
              >
                {p.name}
              </button>
            ))}
          </div>
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
                required
              />
            </div>
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
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
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
          ))}
        </div>
      )}
    </div>
  );
}
