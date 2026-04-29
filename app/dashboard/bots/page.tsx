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
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: 'preset' | 'custom';
  description?: string | null;
  created_at: string;
  balance_eur: number;
  bot_subscription_count: number;
  /** workspace_bots.scope_to_workspace — Mode B isolation for partner keys. */
  scope_to_workspace?: boolean;
}

interface Preset {
  name: string;
  ua_pattern: string;
  operator: string;
  description?: string;
}

interface BotSubscription {
  id: string;
  workspace_id: string;
  bot_id: string;
  bot_name: string;
  external_user_id: string | null;
  label: string | null;
  balance_eur: number;
  active_keys: number;
  created_at: string | null;
  archived_at: string | null;
}

interface ApiKey {
  id: string;
  label: string | null;
  api_key_prefix: string;
  bot_id: string;
  bot_name: string;
  bot_subscription_id: string;
  bot_subscription_label: string | null;
  bot_subscription_external_user_id: string | null;
  bot_subscription_balance_eur: number;
  last_used_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
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

  // Subscriptions drawer state
  const [subscriptionsFor, setSubscriptionsFor] = useState<Bot | null>(null);
  const [subscriptions, setSubscriptions] = useState<BotSubscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [showNewSubscription, setShowNewSubscription] = useState(false);
  const [newSubscriptionLabel, setNewSubscriptionLabel] = useState("");
  const [newSubscriptionExternalId, setNewSubscriptionExternalId] = useState("");
  const [newSubscriptionKeyLabel, setNewSubscriptionKeyLabel] = useState("");
  const [creatingSubscription, setCreatingSubscription] = useState(false);

  // Subscription detail state
  const [activeSubscription, setActiveSubscription] = useState<BotSubscription | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKey | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<BotSubscription | null>(null);

  // Top-up state
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpDescription, setTopUpDescription] = useState("");
  const [toppingUp, setToppingUp] = useState(false);

  // Workspace scope toggle state (per-bot, persisted on workspace_bots)
  const [scopeUpdating, setScopeUpdating] = useState(false);

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
      const res = await fetch("/api/bots", {
        headers: { "x-workspace-id": workspaceId },
      });
      if (res.ok) setBots(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchPresets = useCallback(async () => {
    const res = await fetch("/api/bots/presets");
    if (res.ok) setPresets(await res.json());
  }, []);

  useEffect(() => {
    void fetchBots();
    void fetchPresets();
  }, [fetchBots, fetchPresets]);

  // ---------------------------------------------------------------------------
  // Bot CRUD
  // ---------------------------------------------------------------------------

  const addPresetBot = async (preset: Preset) => {
    const res = await fetch("/api/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
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

    const res = await fetch("/api/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
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
    const res = await fetch(`/api/bots/${bot.id}`, {
      method: "DELETE",
      headers: { "x-workspace-id": workspaceId },
    });

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

  const saveEdit = async (botId: string) => {
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

    const res = await fetch(`/api/bots/${botId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify(body),
    });

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
  // Subscriptions drawer
  // ---------------------------------------------------------------------------

  const fetchSubscriptions = useCallback(
    async (botId: string) => {
      setSubscriptionsLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/bot-subscriptions?bot_id=${botId}`
        );
        if (res.ok) setSubscriptions(await res.json());
        else setSubscriptions([]);
      } finally {
        setSubscriptionsLoading(false);
      }
    },
    [workspaceId]
  );

  // Toggle workspace_bots.scope_to_workspace for the bot in the drawer.
  // Optimistic update + rollback on failure.
  const toggleScopeToWorkspace = async (next: boolean) => {
    if (!subscriptionsFor || scopeUpdating) return;
    const prev = subscriptionsFor.scope_to_workspace ?? false;
    setSubscriptionsFor({ ...subscriptionsFor, scope_to_workspace: next });
    setBots((current) =>
      current.map((b) =>
        b.id === subscriptionsFor.id ? { ...b, scope_to_workspace: next } : b
      )
    );
    setScopeUpdating(true);
    try {
      const res = await fetch(`/api/bots/${subscriptionsFor.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ scope_to_workspace: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? json.error ?? "Failed to update scope");
      }
      showToast(
        next
          ? "Catalog access constrained to this workspace"
          : "Catalog access opened to all matching publishers",
        "success"
      );
    } catch (err) {
      // Rollback
      setSubscriptionsFor((cur) =>
        cur ? { ...cur, scope_to_workspace: prev } : cur
      );
      setBots((current) =>
        current.map((b) =>
          b.id === subscriptionsFor.id ? { ...b, scope_to_workspace: prev } : b
        )
      );
      showToast(err instanceof Error ? err.message : "Failed to update scope", "error");
    } finally {
      setScopeUpdating(false);
    }
  };

  const openSubscriptionsDrawer = useCallback(
    (bot: Bot) => {
      setSubscriptionsFor(bot);
      setActiveSubscription(null);
      setShowNewSubscription(false);
      setJustCreatedKey(null);
      void fetchSubscriptions(bot.id);
    },
    [fetchSubscriptions]
  );

  const closeSubscriptionsDrawer = () => {
    setSubscriptionsFor(null);
    setSubscriptions([]);
    setActiveSubscription(null);
    setKeys([]);
    setJustCreatedKey(null);
    setShowNewSubscription(false);
    setNewSubscriptionLabel("");
    setNewSubscriptionExternalId("");
    setNewSubscriptionKeyLabel("");
    setNewKeyLabel("");
    setTopUpAmount("");
    setTopUpDescription("");
  };

  const createSubscriptionAndKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscriptionsFor) return;
    setCreatingSubscription(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_id: subscriptionsFor.id,
          label: newSubscriptionKeyLabel || undefined,
          bot_subscription_label: newSubscriptionLabel || undefined,
          bot_subscription_external_user_id: newSubscriptionExternalId || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Failed to create subscription", "error");
        return;
      }
      const payload = (await res.json()) as {
        api_key: string;
        record: ApiKey;
      };

      setShowNewSubscription(false);
      setNewSubscriptionLabel("");
      setNewSubscriptionExternalId("");
      setNewSubscriptionKeyLabel("");

      await fetchSubscriptions(subscriptionsFor.id);
      void fetchBots();

      const justCreatedSubscription: BotSubscription = {
        id: payload.record.bot_subscription_id,
        workspace_id: workspaceId,
        bot_id: payload.record.bot_id,
        bot_name: payload.record.bot_name,
        external_user_id: payload.record.bot_subscription_external_user_id,
        label: payload.record.bot_subscription_label,
        balance_eur: payload.record.bot_subscription_balance_eur,
        active_keys: 1,
        created_at: payload.record.created_at,
        archived_at: null,
      };
      setActiveSubscription(justCreatedSubscription);
      setKeys([payload.record]);
      setJustCreatedKey(payload.api_key);
    } finally {
      setCreatingSubscription(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Subscription detail
  // ---------------------------------------------------------------------------

  const openSubscriptionDetail = useCallback(
    async (subscription: BotSubscription) => {
      setActiveSubscription(subscription);
      setJustCreatedKey(null);
      setKeys([]);
      setKeysLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/api-keys?bot_subscription_id=${subscription.id}`
        );
        if (res.ok) setKeys(await res.json());
      } finally {
        setKeysLoading(false);
      }
    },
    [workspaceId]
  );

  const backToSubscriptionList = () => {
    setActiveSubscription(null);
    setKeys([]);
    setJustCreatedKey(null);
    setNewKeyLabel("");
    setTopUpAmount("");
    setTopUpDescription("");
  };

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubscription || !subscriptionsFor) return;
    setCreatingKey(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_id: subscriptionsFor.id,
          bot_subscription_id: activeSubscription.id,
          label: newKeyLabel || undefined,
        }),
      });
      if (res.ok) {
        const payload = (await res.json()) as {
          api_key: string;
          record: ApiKey;
        };
        setJustCreatedKey(payload.api_key);
        setNewKeyLabel("");
        setKeys((prev) => [payload.record, ...prev]);
        setActiveSubscription((prev) =>
          prev ? { ...prev, active_keys: prev.active_keys + 1 } : prev
        );
      } else {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Failed to create key", "error");
      }
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeKey = async (key: ApiKey) => {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/api-keys/${key.id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
      setActiveSubscription((prev) =>
        prev ? { ...prev, active_keys: Math.max(0, prev.active_keys - 1) } : prev
      );
      showToast("Key revoked", "success");
    } else {
      showToast("Failed to revoke key", "error");
    }
    setConfirmRevoke(null);
  };

  const topUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubscription) return;
    const amount = parseFloat(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a positive amount", "error");
      return;
    }
    setToppingUp(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/bot-subscriptions/${activeSubscription.id}/credits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_eur: amount,
            description: topUpDescription || undefined,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Top-up failed", "error");
        return;
      }
      const payload = (await res.json()) as {
        new_balance: number;
        transaction_id: string;
      };
      setActiveSubscription((prev) =>
        prev ? { ...prev, balance_eur: payload.new_balance } : prev
      );
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === activeSubscription.id ? { ...s, balance_eur: payload.new_balance } : s
        )
      );
      setTopUpAmount("");
      setTopUpDescription("");
      void fetchBots();
      showToast(`Credited €${amount.toFixed(2)}`, "success");
    } finally {
      setToppingUp(false);
    }
  };

  const archiveSubscription = async (subscription: BotSubscription) => {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/bot-subscriptions/${subscription.id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      showToast("Subscription archived", "success");
      setConfirmArchive(null);
      backToSubscriptionList();
      if (subscriptionsFor) void fetchSubscriptions(subscriptionsFor.id);
      void fetchBots();
    } else {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to archive subscription", "error");
      setConfirmArchive(null);
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

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Bots</h1>
        <div className="flex gap-2">
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

      {/* Add custom bot form */}
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
              Comma- or whitespace-separated list of CIDR ranges. At least one
              range is required to identify the bot during traffic authorization.
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

      {/* Search */}
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

      {/* Bots list */}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openSubscriptionsDrawer(bot)}
                    >
                      Subscriptions
                    </Button>
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

      {/* Confirm remove */}
      <ConfirmDialog
        open={!!confirmTarget}
        title={`Remove ${confirmTarget?.name ?? "bot"}?`}
        description="This will remove the bot from your workspace and unlink it from all associated catalogs."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => confirmTarget && removeBot(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />

      {/* Preset picker modal */}
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

      {/* Subscriptions drawer */}
      {subscriptionsFor && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={closeSubscriptionsDrawer}
        >
          <div
            className="h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {activeSubscription ? (
              /* ===================== SUBSCRIPTION DETAIL ===================== */
              <>
                <div className="px-6 py-4 border-b border-gray-200">
                  <button
                    onClick={backToSubscriptionList}
                    className="text-xs text-gray-500 hover:text-gray-800 mb-2"
                  >
                    ← Back to subscriptions
                  </button>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-gray-900 truncate">
                        {activeSubscription.label ?? (
                          <span className="text-gray-400">Unlabeled subscription</span>
                        )}
                      </h2>
                      <div className="mt-1 text-xs text-gray-500 space-y-0.5">
                        <div>
                          Bot:{" "}
                          <span className="font-mono text-gray-700">
                            {subscriptionsFor.name}
                          </span>
                        </div>
                        {activeSubscription.external_user_id && (
                          <div>
                            External user id:{" "}
                            <span className="font-mono text-gray-700">
                              {activeSubscription.external_user_id}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={closeSubscriptionsDrawer}
                      className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-900">
                      <span className="text-gray-500">Balance:</span>{" "}
                      <span className="font-mono font-medium">
                        €{activeSubscription.balance_eur.toFixed(2)}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmArchive(activeSubscription)}
                      disabled={activeSubscription.balance_eur > 0}
                      title={
                        activeSubscription.balance_eur > 0
                          ? "Refund the subscription before archiving"
                          : undefined
                      }
                    >
                      Archive subscription
                    </Button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {justCreatedKey && (
                    <div className="rounded-lg border border-green-300 bg-green-50 p-4">
                      <p className="text-sm font-medium text-green-900 mb-2">
                        Key created — copy it now, it will not be shown again.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-gray-900 text-white font-mono text-xs p-2 break-all">
                          {justCreatedKey}
                        </code>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            void navigator.clipboard.writeText(justCreatedKey);
                            showToast("Key copied", "success");
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}

                  <form
                    onSubmit={topUp}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                  >
                    <h3 className="text-sm font-medium text-gray-900 mb-2">
                      Top up
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                      MVP: admin-driven credit. Requires at least one active key
                      on this subscription.
                    </p>
                    <div className="grid grid-cols-[120px_1fr_auto] gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                        placeholder="€ amount"
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                        required
                      />
                      <input
                        type="text"
                        value={topUpDescription}
                        onChange={(e) => setTopUpDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                      <Button
                        type="submit"
                        loading={toppingUp}
                        disabled={activeSubscription.active_keys === 0}
                      >
                        Credit
                      </Button>
                    </div>
                  </form>

                  <form
                    onSubmit={createKey}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                  >
                    <h3 className="text-sm font-medium text-gray-900 mb-2">
                      Generate a new key for this subscription
                    </h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newKeyLabel}
                        onChange={(e) => setNewKeyLabel(e.target.value)}
                        placeholder="Label (optional)"
                        maxLength={100}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                      <Button type="submit" loading={creatingKey}>
                        Create key
                      </Button>
                    </div>
                  </form>

                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">
                      Active keys ({keys.length})
                    </h3>
                    {keysLoading ? (
                      <div className="text-center py-6 text-gray-500 text-sm">
                        Loading…
                      </div>
                    ) : keys.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">
                        No active keys on this subscription.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {keys.map((k) => (
                          <div
                            key={k.id}
                            className="rounded-lg border border-gray-200 bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {k.label ?? (
                                    <span className="text-gray-400">
                                      No label
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 font-mono mt-0.5">
                                  {k.api_key_prefix}…
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                  {k.last_used_at
                                    ? `Last used ${new Date(k.last_used_at).toLocaleString()}`
                                    : "Never used"}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmRevoke(k)}
                              >
                                Revoke
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* ===================== SUBSCRIPTION LIST ===================== */
              <>
                <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Subscriptions
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      For bot{" "}
                      <span className="font-mono text-gray-700">
                        {subscriptionsFor.name}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={closeSubscriptionsDrawer}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                {/* Workspace scope toggle (workspace_bots.scope_to_workspace) */}
                <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subscriptionsFor.scope_to_workspace ?? false}
                      disabled={scopeUpdating}
                      onChange={(e) => void toggleScopeToWorkspace(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        Constrain to my workspace catalogs
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        When enabled, API keys for this bot only see catalogs you own.
                        Use this for partner integrations where the consumer should not
                        access other publishers&apos; content. Leave OFF for self-serve
                        consumer keys that should reach every matching publisher.
                      </div>
                    </div>
                  </label>
                </div>

                <div className="p-6 space-y-4">
                  {showNewSubscription ? (
                    <form
                      onSubmit={createSubscriptionAndKey}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
                    >
                      <h3 className="text-sm font-medium text-gray-900">
                        New subscription
                      </h3>
                      <p className="text-xs text-gray-500">
                        A first API key is generated at the same time and shown
                        once on the next screen.
                      </p>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Subscription label (optional)
                        </label>
                        <input
                          type="text"
                          value={newSubscriptionLabel}
                          onChange={(e) => setNewSubscriptionLabel(e.target.value)}
                          placeholder="e.g. Seat 'acme-prod'"
                          maxLength={100}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          External user id (optional)
                        </label>
                        <input
                          type="text"
                          value={newSubscriptionExternalId}
                          onChange={(e) =>
                            setNewSubscriptionExternalId(e.target.value)
                          }
                          placeholder="Your internal user/seat id — unique per bot"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          First key label (optional)
                        </label>
                        <input
                          type="text"
                          value={newSubscriptionKeyLabel}
                          onChange={(e) =>
                            setNewSubscriptionKeyLabel(e.target.value)
                          }
                          placeholder="e.g. Production"
                          maxLength={100}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowNewSubscription(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" loading={creatingSubscription}>
                          Create subscription + key
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex justify-end">
                      <Button onClick={() => setShowNewSubscription(true)}>
                        New subscription
                      </Button>
                    </div>
                  )}

                  {subscriptionsLoading ? (
                    <div className="text-center py-6 text-gray-500 text-sm">
                      Loading…
                    </div>
                  ) : subscriptions.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">
                      No subscriptions yet for this bot.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {subscriptions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => void openSubscriptionDetail(s)}
                          className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {s.label ?? (
                                  <span className="text-gray-400">
                                    Unlabeled subscription
                                  </span>
                                )}
                              </div>
                              {s.external_user_id && (
                                <div className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                                  {s.external_user_id}
                                </div>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                {s.active_keys} active key
                                {s.active_keys === 1 ? "" : "s"} · created{" "}
                                {s.created_at
                                  ? new Date(s.created_at).toLocaleDateString()
                                  : "—"}
                              </div>
                            </div>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-900 whitespace-nowrap">
                              <span className="text-gray-500">€</span>
                              <span className="font-mono font-medium">
                                {s.balance_eur.toFixed(2)}
                              </span>
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRevoke}
        title="Revoke API key?"
        description={`The key "${confirmRevoke?.label ?? confirmRevoke?.api_key_prefix}" will be invalidated immediately. The subscription's balance is preserved.`}
        confirmLabel="Revoke"
        variant="danger"
        onConfirm={() => confirmRevoke && revokeKey(confirmRevoke)}
        onCancel={() => setConfirmRevoke(null)}
      />

      <ConfirmDialog
        open={!!confirmArchive}
        title="Archive subscription?"
        description="All active keys on this subscription will be revoked. The subscription is soft-deleted and stops appearing in lists."
        confirmLabel="Archive"
        variant="danger"
        onConfirm={() => confirmArchive && archiveSubscription(confirmArchive)}
        onCancel={() => setConfirmArchive(null)}
      />
    </div>
  );
}
