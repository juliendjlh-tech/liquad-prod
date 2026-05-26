"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import DropdownMenu from "@/app/components/ui/DropdownMenu";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Bot {
  id: string;
  public_id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: 'preset' | 'custom';
  description?: string | null;
  created_at: string;
}

interface Preset {
  name: string;
  ua_pattern: string;
  operator: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BotsPage() {
  const { id: workspaceId } = useWorkspace();
  const [bots, setBots] = useState<Bot[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  // Add custom bot form
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPattern, setCustomPattern] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customIps, setCustomIps] = useState("");

  // Preset picker modal
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [addingPresets, setAddingPresets] = useState(false);

  // Edit inline
  const [editingBot, setEditingBot] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPattern, setEditPattern] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIps, setEditIps] = useState("");

  const [confirmTarget, setConfirmTarget] = useState<Bot | null>(null);
  const [search, setSearch] = useState("");

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ---------------------------------------------------------------------------
  // Fetch bots + presets
  // ---------------------------------------------------------------------------

  const fetchBots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/bots`);
      if (res.ok) setBots(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchPresets = useCallback(async () => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/bots/presets`);
    if (res.ok) setPresets(await res.json());
  }, [workspaceId]);

  useEffect(() => {
    void fetchBots();
    void fetchPresets();
  }, [fetchBots, fetchPresets]);

  // ---------------------------------------------------------------------------
  // Bot CRUD
  // ---------------------------------------------------------------------------

  const addPresetBot = async (preset: Preset) => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "subscribe_preset",
        name: preset.name,
      }),
    });

    if (res.ok) {
      return true;
    } else {
      const json = await res.json();
      showToast(json.error ?? `Failed to add ${preset.name}`, "error");
      return false;
    }
  };

  const addSelectedPresets = async () => {
    if (selectedPresets.size === 0) return;
    setAddingPresets(true);
    const toAdd = presets.filter((p) => selectedPresets.has(p.name));
    let added = 0;
    for (const preset of toAdd) {
      const ok = await addPresetBot(preset);
      if (ok) added++;
    }
    if (added > 0) {
      showToast(
        added === 1 ? "Bot added" : `${added} bots added`,
        "success"
      );
      void fetchBots();
    }
    setAddingPresets(false);
    setShowPresetPicker(false);
    setSelectedPresets(new Set());
  };

  const addCustomBot = async (e: React.FormEvent) => {
    e.preventDefault();

    const ips = customIps
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch(`/api/internal/workspaces/${workspaceId}/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_custom",
        name: customName,
        ua_pattern: customPattern,
        description: customDescription || undefined,
        declared_ips: ips,
      }),
    });

    if (res.ok) {
      showToast("Custom bot added", "success");
      setShowAddCustom(false);
      setCustomName("");
      setCustomPattern("");
      setCustomDescription("");
      setCustomIps("");
      void fetchBots();
    } else {
      const json = await res.json();
      showToast(json.message ?? json.error ?? "Failed to add bot", "error");
    }
  };

  const removeBot = async (bot: Bot) => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/bots/${bot.id}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      const json = await res.json();
      const warning = json.warning ? ` — ${json.warning}` : "";
      showToast(`${bot.name} removed${warning}`, "success");
      void fetchBots();
    }
    setConfirmTarget(null);
  };

  const startEdit = (bot: Bot) => {
    setEditingBot(bot.id);
    setEditName(bot.name);
    setEditPattern(bot.ua_pattern);
    setEditDescription(bot.description ?? "");
    setEditIps((bot.declared_ips ?? []).join("\n"));
  };

  const cancelEdit = () => {
    setEditingBot(null);
    setEditName("");
    setEditPattern("");
    setEditDescription("");
    setEditIps("");
  };

  const saveEdit = async (botPublicId: string) => {
    const parsedIps = editIps
      .split("\n")
      .map((ip) => ip.trim())
      .filter(Boolean);

    const body: Record<string, unknown> = {
      name: editName,
      ua_pattern: editPattern,
      description: editDescription || undefined,
    };
    if (parsedIps.length > 0) {
      body.declared_ips = parsedIps;
    }

    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/bots/${botPublicId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (res.ok) {
      showToast("Bot updated", "success");
      cancelEdit();
      void fetchBots();
    } else {
      const json = await res.json();
      showToast(json.error ?? "Failed to update bot", "error");
    }
  };

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const isPreset = (b: Bot) => b.type === "preset";

  const addedPresetNames = new Set(
    bots.filter((b) => isPreset(b)).map((b) => b.name)
  );

  const q = search.toLowerCase().trim();
  const visibleBots = bots.filter((b) => {
    if (!q) return true;
    return (
      b.name.toLowerCase().includes(q) ||
      b.ua_pattern.toLowerCase().includes(q) ||
      (b.description?.toLowerCase().includes(q) ?? false)
    );
  });

  const availablePresets = presets.filter((p) => !addedPresetNames.has(p.name));

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

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Bots Watchlist</h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          The AI crawlers you want to monitor and block by default, unless
          you grant them explicit access through a catalog. Start from our
          library of known crawlers (GPTBot, ClaudeBot, Perplexity…) or add
          your own.
        </p>
      </div>

      <div className="mb-6">
        <div className="flex gap-2 justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              setShowPresetPicker(true);
              setSelectedPresets(new Set());
            }}
          >
            Add from Presets
          </Button>
          <Button onClick={() => setShowAddCustom(!showAddCustom)}>
            Add Custom Bot
          </Button>
        </div>
      </div>

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
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
              placeholder="Optional description"
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Declared IP Ranges (CIDR)
            </label>
            <textarea
              value={customIps}
              onChange={(e) => setCustomIps(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
              placeholder="e.g. 66.249.64.0/19, 2001:4860::/32"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Comma- or whitespace-separated list of CIDR ranges. At least one range is required to identify the bot during traffic authorization.
            </p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAddCustom(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      )}

      {bots.length > 0 && (
        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, UA pattern, description..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : bots.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm mb-4">No bots added yet.</p>
          <div className="flex justify-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowPresetPicker(true);
                setSelectedPresets(new Set());
              }}
            >
              Add from Presets
            </Button>
            <Button size="sm" onClick={() => setShowAddCustom(true)}>
              Add Custom Bot
            </Button>
          </div>
        </div>
      ) : visibleBots.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No bots match your search.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleBots.map((bot) => (
            <div
              key={bot.id}
              className="group rounded-lg border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              {editingBot === bot.id ? (
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
                      Description
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm resize-none"
                      rows={2}
                      placeholder="Optional description"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Declared IPs / CIDR ranges
                      <span className="ml-1 font-normal text-gray-400">
                        (one per line, e.g. 203.0.113.0/24)
                      </span>
                    </label>
                    <textarea
                      value={editIps}
                      onChange={(e) => setEditIps(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono resize-none"
                      rows={3}
                      placeholder={"203.0.113.0/24\n2001:db8::/32"}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(bot.id)}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {bot.name}
                      </span>
                      {isPreset(bot) ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          Preset
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          Custom
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {bot.ua_pattern}
                    </div>
                    {bot.description && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {bot.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu
                        items={[
                          ...(!isPreset(bot)
                            ? [{ label: "Edit", onClick: () => startEdit(bot) }]
                            : []),
                          {
                            label: "Remove",
                            onClick: () => setConfirmTarget(bot),
                            variant: "danger" as const,
                            separator: !isPreset(bot),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        title={`Remove ${confirmTarget?.name ?? "bot"}?`}
        description="This will remove the bot from your workspace and unlink it from all associated catalogs."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => confirmTarget && removeBot(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />

      {showPresetPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowPresetPicker(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Add from Presets
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select one or more bots to add to your workspace.
                </p>
              </div>
              <button
                onClick={() => setShowPresetPicker(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
              {presets.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No presets available.
                </div>
              ) : (
                presets.map((preset) => {
                  const alreadyAdded = addedPresetNames.has(preset.name);
                  const selected = selectedPresets.has(preset.name);
                  return (
                    <label
                      key={preset.name}
                      className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                        alreadyAdded
                          ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                          : selected
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 shrink-0"
                        checked={alreadyAdded || selected}
                        disabled={alreadyAdded}
                        onChange={(e) => {
                          if (alreadyAdded) return;
                          setSelectedPresets((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(preset.name);
                            else next.delete(preset.name);
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {preset.name}
                          </span>
                          {alreadyAdded && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                              Added
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 font-mono">
                          {preset.ua_pattern}
                        </div>
                        {preset.description && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {preset.description}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">
                {selectedPresets.size > 0
                  ? `${selectedPresets.size} selected`
                  : availablePresets.length === 0
                  ? "All presets already added"
                  : "Select bots to add"}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPresetPicker(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={selectedPresets.size === 0}
                  loading={addingPresets}
                  onClick={() => void addSelectedPresets()}
                >
                  {selectedPresets.size > 1
                    ? `Add ${selectedPresets.size} bots`
                    : "Add bot"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
