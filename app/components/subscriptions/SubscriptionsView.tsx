"use client";

// ---------------------------------------------------------------------------
// SubscriptionsView (post-network refactor)
//
// Shows the workspace's wallets (subscriptions) and the API keys attached to
// each. Since migration 041 a subscription is a pure wallet — no scope, no
// allowlist, no price cap. API keys carry the (subscription, network, bot)
// triple. Network and bot are picked at key creation time, immutable after.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Subscription {
  id: string;
  workspace_id: string;
  external_user_id: string | null;
  label: string | null;
  balance_eur: number;
  active_keys: number;
  created_at: string | null;
  archived_at: string | null;
}

interface NetworkOption {
  id: string;
  public_id: string;
  name: string;
}

interface BotOption {
  id: string;
  public_id: string;
  name: string;
  ua_pattern: string;
  type: string;
}

interface ApiKey {
  id: string;
  label: string | null;
  api_key_prefix: string;
  subscription_id: string;
  subscription_label: string | null;
  subscription_balance_eur: number;
  network_id: string;
  network_name: string | null;
  bot_id: string;
  bot_name: string | null;
  last_used_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
}

// `mode` is preserved as a prop for backward compatibility with the routes
// that mount this component, but it no longer drives any data-model decision.
export type SubscriptionsMode = "publisher" | "access";

interface SubscriptionsViewProps {
  mode?: SubscriptionsMode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SubscriptionsView(_props: SubscriptionsViewProps) {
  const { id: workspaceId } = useWorkspace();

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [networks, setNetworks] = useState<NetworkOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Create-subscription form
  const [showNew, setShowNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newExternalId, setNewExternalId] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail panel
  const [active, setActive] = useState<Subscription | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);

  // Create-key form
  const [keyLabel, setKeyLabel] = useState("");
  const [keyNetworkId, setKeyNetworkId] = useState("");
  const [keyBotId, setKeyBotId] = useState("");
  const [availableBots, setAvailableBots] = useState<BotOption[]>([]);
  const [creatingKey, setCreatingKey] = useState(false);

  // Top-up form
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpDescription, setTopUpDescription] = useState("");
  const [toppingUp, setToppingUp] = useState(false);

  // Dialogs
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKey | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Subscription | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/subscriptions`);
      if (res.ok) setSubscriptions(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchNetworks = useCallback(async () => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/networks`);
    if (res.ok) setNetworks(await res.json());
  }, [workspaceId]);

  useEffect(() => {
    void fetchSubscriptions();
    void fetchNetworks();
  }, [fetchSubscriptions, fetchNetworks]);

  const fetchKeys = useCallback(
    async (subscriptionId: string) => {
      setKeysLoading(true);
      try {
        const res = await fetch(
          `/api/internal/workspaces/${workspaceId}/api-keys?subscription_id=${subscriptionId}`,
        );
        if (res.ok) setKeys(await res.json());
      } finally {
        setKeysLoading(false);
      }
    },
    [workspaceId],
  );

  // When the user picks a network, fetch the derived bot set for that network.
  useEffect(() => {
    if (!keyNetworkId) {
      setAvailableBots([]);
      setKeyBotId("");
      return;
    }
    let cancel = false;
    (async () => {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/networks/${keyNetworkId}/available-bots`,
      );
      if (!cancel && res.ok) {
        const data = await res.json();
        setAvailableBots(data.bots ?? []);
        // Auto-pick if exactly one option.
        if ((data.bots ?? []).length === 1) {
          setKeyBotId(data.bots[0].id);
        } else {
          setKeyBotId("");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [workspaceId, keyNetworkId]);

  // ---------------------------------------------------------------------------
  // Create subscription (wallet only — no key)
  // ---------------------------------------------------------------------------

  const createSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel || undefined,
          external_user_id: newExternalId || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Failed to create subscription", "error");
        return;
      }
      setShowNew(false);
      setNewLabel("");
      setNewExternalId("");
      void fetchSubscriptions();
      showToast("Subscription created", "success");
    } finally {
      setCreating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Detail actions
  // ---------------------------------------------------------------------------

  const openDetail = (subscription: Subscription) => {
    setActive(subscription);
    setJustCreatedKey(null);
    setKeys([]);
    setKeyLabel("");
    setKeyNetworkId("");
    setKeyBotId("");
    setTopUpAmount("");
    setTopUpDescription("");
    void fetchKeys(subscription.id);
  };

  const closeDetail = () => {
    setActive(null);
    setKeys([]);
    setJustCreatedKey(null);
  };

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !keyNetworkId || !keyBotId) return;
    setCreatingKey(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_id: active.id,
          network_id: keyNetworkId,
          bot_id: keyBotId,
          label: keyLabel || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Failed to create API key", "error");
        return;
      }
      const payload = (await res.json()) as { api_key: string; record: ApiKey };
      setJustCreatedKey(payload.api_key);
      setKeys((prev) => [payload.record, ...prev]);
      setKeyLabel("");
      setKeyNetworkId("");
      setKeyBotId("");
      void fetchSubscriptions();
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeKey = async (key: ApiKey) => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/api-keys/${key.id}`, {
      method: "DELETE",
    });
    setConfirmRevoke(null);
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
      void fetchSubscriptions();
      showToast("API key revoked", "success");
    } else {
      showToast("Failed to revoke key", "error");
    }
  };

  const archiveSubscription = async (subscription: Subscription) => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/subscriptions/${subscription.id}`,
      { method: "DELETE" },
    );
    setConfirmArchive(null);
    if (res.ok) {
      closeDetail();
      void fetchSubscriptions();
      showToast("Subscription archived", "success");
    } else {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to archive subscription", "error");
    }
  };

  const topUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active) return;
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Invalid amount", "error");
      return;
    }
    setToppingUp(true);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/subscriptions/${active.id}/credits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_eur: amount,
            description: topUpDescription || undefined,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Top-up failed", "error");
        return;
      }
      const data = await res.json();
      setActive({ ...active, balance_eur: Number(data.new_balance) });
      setTopUpAmount("");
      setTopUpDescription("");
      void fetchSubscriptions();
      showToast("Balance credited", "success");
    } finally {
      setToppingUp(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Subscriptions</h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          Wallets you manage as a subscription manager. Each wallet funds
          content grants when its API keys are used; the sub manager retains a
          7% revenue share on every grant.
        </p>
      </div>

      <div className="mb-6 flex justify-end items-center gap-2">
        <span className="text-sm text-gray-500">
          {subscriptions.length} subscription{subscriptions.length !== 1 ? "s" : ""}
        </span>
        <Button onClick={() => setShowNew(true)}>New subscription</Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : subscriptions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No subscriptions yet</p>
          <Button variant="ghost" onClick={() => setShowNew(true)}>
            Create your first subscription
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {subscriptions.map((s) => (
            <button
              key={s.id}
              onClick={() => openDetail(s)}
              className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4 text-left hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {s.label ?? <span className="text-gray-400">Unlabeled</span>}
                  </span>
                  {s.archived_at && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                      Archived
                    </span>
                  )}
                </div>
                <div className="mt-1 flex gap-4 text-xs text-gray-500">
                  {s.external_user_id && <span>{s.external_user_id}</span>}
                  <span>{s.active_keys} active key{s.active_keys !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="font-mono text-sm text-gray-900">
                  €{s.balance_eur.toFixed(4)}
                </span>
                <span className="text-gray-400">&rsaquo;</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create subscription modal */}
      {showNew && (
        <Modal onClose={() => setShowNew(false)} title="New subscription">
          <form onSubmit={createSubscription} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Label <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Acme Corp wallet"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                External user ID <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={newExternalId}
                onChange={(e) => setNewExternalId(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Your internal customer id"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail drawer */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={closeDetail}
        >
          <div
            className="h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">
                  {active.label ?? <span className="text-gray-400">Unlabeled</span>}
                </h2>
                <div className="mt-0.5 text-xs text-gray-500">
                  {active.external_user_id && (
                    <span className="mr-3">{active.external_user_id}</span>
                  )}
                  {active.created_at && (
                    <span>Created {new Date(active.created_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <button
                onClick={closeDetail}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Balance card */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-600">Balance</span>
                <span className="font-mono text-xl font-semibold text-gray-900">
                  €{active.balance_eur.toFixed(4)}
                </span>
              </div>

              {/* Top up */}
              <form onSubmit={topUp} className="rounded-lg border border-gray-200 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Top up balance</h3>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="EUR"
                  />
                  <input
                    type="text"
                    value={topUpDescription}
                    onChange={(e) => setTopUpDescription(e.target.value)}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Description (optional)"
                  />
                  <Button type="submit" disabled={toppingUp}>
                    {toppingUp ? "…" : "Credit"}
                  </Button>
                </div>
              </form>

              {/* API keys */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-900">API keys</h3>

                {justCreatedKey && (
                  <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <div className="text-sm font-semibold text-amber-900 mb-2">
                      Copy this key now — it will not be shown again.
                    </div>
                    <code className="block break-all font-mono text-xs text-amber-900 bg-amber-100 rounded p-2">
                      {justCreatedKey}
                    </code>
                  </div>
                )}

                {/* Generate key form */}
                <form
                  onSubmit={createKey}
                  className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
                >
                  <h4 className="text-xs font-medium text-gray-700">Generate a new API key</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={keyNetworkId}
                      onChange={(e) => setKeyNetworkId(e.target.value)}
                      required
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white"
                    >
                      <option value="">Network…</option>
                      {networks.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={keyBotId}
                      onChange={(e) => setKeyBotId(e.target.value)}
                      required
                      disabled={!keyNetworkId || availableBots.length === 0}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="">
                        {!keyNetworkId
                          ? "Pick a network first"
                          : availableBots.length === 0
                            ? "No bots derivable"
                            : "Bot…"}
                      </option>
                      {availableBots.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.ua_pattern})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={keyLabel}
                      onChange={(e) => setKeyLabel(e.target.value)}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Label (optional)"
                    />
                    <Button
                      type="submit"
                      disabled={creatingKey || !keyNetworkId || !keyBotId}
                    >
                      {creatingKey ? "Generating…" : "Generate key"}
                    </Button>
                  </div>
                </form>

                {/* Keys list */}
                {keysLoading ? (
                  <div className="text-sm text-gray-500 py-4 text-center">Loading keys…</div>
                ) : keys.length === 0 ? (
                  <div className="text-sm text-gray-500 py-4 text-center">No API keys yet.</div>
                ) : (
                  <div className="space-y-2">
                    {keys.map((k) => (
                      <div
                        key={k.id}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-700">
                              {k.api_key_prefix}…
                            </span>
                            {k.label && (
                              <span className="text-sm text-gray-900">{k.label}</span>
                            )}
                          </div>
                          <div className="mt-0.5 flex gap-3 text-xs text-gray-500">
                            <span>{k.network_name ?? "—"}</span>
                            <span>{k.bot_name ?? "—"}</span>
                            {k.created_at && (
                              <span>{new Date(k.created_at).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => setConfirmRevoke(k)}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Danger zone */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Danger zone</h3>
                <p className="text-xs text-gray-500">
                  The subscription must have a zero balance before archiving. All
                  active API keys will be revoked.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmArchive(active)}
                  disabled={active.balance_eur > 0}
                >
                  Archive subscription
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRevoke}
        title="Revoke API key"
        description={`Revoke ${confirmRevoke?.api_key_prefix ?? ""}… ? This cannot be undone.`}
        confirmLabel="Revoke"
        onConfirm={() => confirmRevoke && revokeKey(confirmRevoke)}
        onCancel={() => setConfirmRevoke(null)}
      />

      <ConfirmDialog
        open={!!confirmArchive}
        title="Archive subscription"
        description="The subscription must be empty (balance = 0). All API keys will be revoked."
        confirmLabel="Archive"
        onConfirm={() => confirmArchive && archiveSubscription(confirmArchive)}
        onCancel={() => setConfirmArchive(null)}
      />

      {toast && (
        <div
          className={`fixed top-4 right-4 z-[70] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimal modal (kept for create-subscription form)
// ---------------------------------------------------------------------------

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
