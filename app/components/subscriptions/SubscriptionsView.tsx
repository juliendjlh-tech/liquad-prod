"use client";

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
  scope_to_workspace: boolean;
  created_at: string | null;
  archived_at: string | null;
}

interface ApiKey {
  id: string;
  label: string | null;
  api_key_prefix: string;
  subscription_id: string;
  subscription_label: string | null;
  subscription_external_user_id: string | null;
  subscription_balance_eur: number;
  default_bot_id: string | null;
  default_bot_name: string | null;
  last_used_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
}

interface BotOption {
  id: string;
  name: string;
}

export type SubscriptionsMode = "publisher" | "access";

interface SubscriptionsViewProps {
  mode: SubscriptionsMode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SubscriptionsView({ mode }: SubscriptionsViewProps) {
  const { id: workspaceId } = useWorkspace();
  const isPublisher = mode === "publisher";
  // Forced scope per mode: publisher → workspace-only; access → network.
  const scopeForMode = isPublisher;

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<BotOption[]>([]);

  // Create form
  const [showNewSubscription, setShowNewSubscription] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newExternalId, setNewExternalId] = useState("");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newDefaultBotId, setNewDefaultBotId] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail panel
  const [active, setActive] = useState<Subscription | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState("");
  const [keyDefaultBotId, setKeyDefaultBotId] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);

  // Top-up
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpDescription, setTopUpDescription] = useState("");
  const [toppingUp, setToppingUp] = useState(false);

  // Confirm dialogs
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKey | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Subscription | null>(null);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

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
      const res = await fetch(
        `/api/workspaces/${workspaceId}/subscriptions?mode=${mode}`
      );
      if (res.ok) setSubscriptions(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId, mode]);

  const fetchBots = useCallback(async () => {
    if (!isPublisher) return;
    const res = await fetch("/api/bots", {
      headers: { "x-workspace-id": workspaceId },
    });
    if (res.ok) {
      const data = (await res.json()) as Array<{ id: string; name: string }>;
      setBots(data.map((b) => ({ id: b.id, name: b.name })));
    }
  }, [workspaceId, isPublisher]);

  useEffect(() => {
    void fetchSubscriptions();
    void fetchBots();
  }, [fetchSubscriptions, fetchBots]);

  const fetchKeys = useCallback(
    async (subscriptionId: string) => {
      setKeysLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/api-keys?subscription_id=${subscriptionId}`
        );
        if (res.ok) setKeys(await res.json());
      } finally {
        setKeysLoading(false);
      }
    },
    [workspaceId]
  );

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  const createSubscriptionAndKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          label: isPublisher && newKeyLabel ? newKeyLabel : undefined,
          subscription_label: newLabel || undefined,
          subscription_external_user_id:
            isPublisher && newExternalId ? newExternalId : undefined,
          default_bot_id: isPublisher && newDefaultBotId ? newDefaultBotId : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? "Failed to create subscription", "error");
        return;
      }
      const payload = (await res.json()) as { api_key: string; record: ApiKey };

      setShowNewSubscription(false);
      setNewLabel("");
      setNewExternalId("");
      setNewKeyLabel("");
      setNewDefaultBotId("");

      const subscription: Subscription = {
        id: payload.record.subscription_id,
        workspace_id: workspaceId,
        external_user_id: payload.record.subscription_external_user_id,
        label: payload.record.subscription_label,
        balance_eur: payload.record.subscription_balance_eur,
        active_keys: 1,
        scope_to_workspace: scopeForMode,
        created_at: payload.record.created_at,
        archived_at: null,
      };
      setActive(subscription);
      setKeys([payload.record]);
      setJustCreatedKey(payload.api_key);
      void fetchSubscriptions();
    } finally {
      setCreating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Detail actions
  // ---------------------------------------------------------------------------

  const openDetail = useCallback(
    (subscription: Subscription) => {
      setActive(subscription);
      setJustCreatedKey(null);
      setKeys([]);
      setKeyLabel("");
      setKeyDefaultBotId("");
      setTopUpAmount("");
      setTopUpDescription("");
      void fetchKeys(subscription.id);
    },
    [fetchKeys]
  );

  const closeDetail = () => {
    setActive(null);
    setKeys([]);
    setJustCreatedKey(null);
  };

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active) return;
    setCreatingKey(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_id: active.id,
          label: isPublisher && keyLabel ? keyLabel : undefined,
          default_bot_id:
            isPublisher && keyDefaultBotId ? keyDefaultBotId : undefined,
        }),
      });
      if (res.ok) {
        const payload = (await res.json()) as { api_key: string; record: ApiKey };
        setJustCreatedKey(payload.api_key);
        setKeyLabel("");
        setKeyDefaultBotId("");
        setKeys((prev) => [payload.record, ...prev]);
        setActive((prev) =>
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
    const res = await fetch(`/api/workspaces/${workspaceId}/api-keys/${key.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
      setActive((prev) =>
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
    if (!active) return;
    const amount = parseFloat(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a positive amount", "error");
      return;
    }
    setToppingUp(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/subscriptions/${active.id}/credits`,
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
      setActive((prev) =>
        prev ? { ...prev, balance_eur: payload.new_balance } : prev
      );
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === active.id ? { ...s, balance_eur: payload.new_balance } : s
        )
      );
      setTopUpAmount("");
      setTopUpDescription("");
      showToast(`Credited €${amount.toFixed(2)}`, "success");
    } finally {
      setToppingUp(false);
    }
  };

  const archiveSubscription = async (subscription: Subscription) => {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/subscriptions/${subscription.id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      showToast("Subscription archived", "success");
      setConfirmArchive(null);
      closeDetail();
      void fetchSubscriptions();
    } else {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to archive subscription", "error");
      setConfirmArchive(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const headerCopy = isPublisher
    ? "Issue prepaid subscriptions for partners or customers. Each subscription holds credit and exposes only your workspace catalogs (end-user mode) — safe to share."
    : "Subscriptions in client mode let you consume the network. Each subscription holds prepaid credit and the wallet is debited as paying content is accessed.";

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
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Subscriptions</h1>
        <p className="text-sm text-gray-500">{headerCopy}</p>
      </div>

      <div className="mb-6 flex justify-end">
        <Button onClick={() => setShowNewSubscription(true)}>
          New subscription
        </Button>
      </div>

      {showNewSubscription && (
        <form
          onSubmit={createSubscriptionAndKey}
          className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
        >
          <h3 className="text-sm font-medium text-gray-900">New subscription</h3>
          <p className="text-xs text-gray-500">
            A first API key is generated at the same time and shown once on the next screen.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Subscription label (optional)
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. acme-prod"
              maxLength={100}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          {isPublisher && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  External user id (optional)
                </label>
                <input
                  type="text"
                  value={newExternalId}
                  onChange={(e) => setNewExternalId(e.target.value)}
                  placeholder="Your internal user/seat id — unique per workspace"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  First key label (optional)
                </label>
                <input
                  type="text"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="e.g. Production"
                  maxLength={100}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Default bot for this key (optional)
                </label>
                <select
                  value={newDefaultBotId}
                  onChange={(e) => setNewDefaultBotId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">— None (caller must pass bot_id at every call)</option>
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  If set, partners can call <code>/licenses</code> without specifying <code>bot_id</code>.
                </p>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowNewSubscription(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create subscription + key
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : subscriptions.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No subscriptions yet. Create one to start issuing API keys.
        </div>
      ) : (
        <div className="space-y-2">
          {subscriptions.map((s) => (
            <button
              key={s.id}
              onClick={() => openDetail(s)}
              className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {s.label ?? <span className="text-gray-400">Unlabeled subscription</span>}
                    </span>
                  </div>
                  {isPublisher && s.external_user_id && (
                    <div className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                      {s.external_user_id}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {s.active_keys} active key{s.active_keys === 1 ? "" : "s"} · created{" "}
                    {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                  </div>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-900 whitespace-nowrap">
                  <span className="text-gray-500">€</span>
                  <span className="font-mono font-medium">{s.balance_eur.toFixed(2)}</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ===================== DETAIL DRAWER ===================== */}
      {active && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={closeDetail}>
          <div
            className="h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {active.label ?? (
                      <span className="text-gray-400">Unlabeled subscription</span>
                    )}
                  </h2>
                  {isPublisher && active.external_user_id && (
                    <div className="mt-1 text-xs text-gray-500">
                      External user id:{" "}
                      <span className="font-mono text-gray-700">
                        {active.external_user_id}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={closeDetail}
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
                    €{active.balance_eur.toFixed(2)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmArchive(active)}
                  disabled={active.balance_eur > 0}
                  title={
                    active.balance_eur > 0
                      ? "Refund the subscription before archiving"
                      : undefined
                  }
                >
                  Archive
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
                <h3 className="text-sm font-medium text-gray-900 mb-2">Top up</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Admin-driven credit. Requires at least one active key on this subscription.
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
                  <Button type="submit" loading={toppingUp} disabled={active.active_keys === 0}>
                    Credit
                  </Button>
                </div>
              </form>

              <form
                onSubmit={createKey}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <h3 className="text-sm font-medium text-gray-900 mb-2">Generate a new key</h3>
                <p className="text-xs text-gray-500 mb-3">
                  {isPublisher
                    ? "Share this key with your partner or customer — it only sees catalogs of your workspace."
                    : "This key has network access. Use it in your crawler or application — never share it with a third party."}
                </p>
                {isPublisher ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={keyLabel}
                      onChange={(e) => setKeyLabel(e.target.value)}
                      placeholder="Label (optional)"
                      maxLength={100}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={keyDefaultBotId}
                      onChange={(e) => setKeyDefaultBotId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">— No default bot (caller must pass bot_id)</option>
                      {bots.map((b) => (
                        <option key={b.id} value={b.id}>
                          Default bot: {b.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex justify-end">
                      <Button type="submit" loading={creatingKey}>
                        Create key
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button type="submit" loading={creatingKey}>
                      Create key
                    </Button>
                  </div>
                )}
              </form>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  Active keys ({keys.length})
                </h3>
                {keysLoading ? (
                  <div className="text-center py-6 text-gray-500 text-sm">Loading…</div>
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {k.label ?? <span className="text-gray-400">No label</span>}
                              </span>
                              {isPublisher && k.default_bot_name && (
                                <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-medium text-blue-700 whitespace-nowrap">
                                  Default bot: {k.default_bot_name}
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
