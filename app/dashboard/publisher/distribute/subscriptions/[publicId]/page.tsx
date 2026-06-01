"use client";

// ---------------------------------------------------------------------------
// /dashboard/publisher/distribute/subscriptions/[publicId]
//
// Subscription detail view. The active subscription is identified by its
// public_id in the URL; internal API calls still use the UUID resolved from
// the workspace's subscription list.
//
// Layout:
//   1. Header        : subscription selector + balance + top-up + new sub + back link
//   2. Integrations  : workspace_bots accordion → plans (access_settings) → keys
//   3. Recent grants : debit ledger grouped by grant, expandable for the 4-way split
//
// Plan + bot lifecycle is handled on the Integrations page; here you can only
// issue / rotate / revoke keys against existing plans.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Subscription {
  id: string;
  public_id: string;
  workspace_id: string;
  external_user_id: string | null;
  label: string | null;
  monthly_cap_eur: number | null;
  current_month_spent_eur: number;
  active_keys: number;
  created_at: string | null;
  archived_at: string | null;
}

interface Bot {
  id: string;
  public_id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: "preset" | "custom";
  description?: string | null;
}

interface AccessSettingsListItem {
  id: string;
  public_id: string;
  workspace_id: string;
  bot_id: string;
  name: string;
  max_price_eur: number | null;
  bot_name: string | null;
  bot_ua_pattern: string | null;
  catalog_count: number;
  created_at: string;
  updated_at: string;
}

interface ApiKey {
  id: string;
  label: string | null;
  api_key_prefix: string;
  subscription_id: string;
  subscription_public_id: string | null;
  subscription_label: string | null;
  subscription_external_user_id: string | null;
  access_settings_id: string;
  access_settings_name: string | null;
  bot_id: string;
  bot_name: string | null;
  last_used_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
}

interface Grant {
  grant_id: string;
  url: string;
  catalog_id: string;
  catalog_name: string | null;
  publisher_workspace_id: string;
  created_at: string;
  total_eur: number;
  split: {
    content_owner: number;
    sub_manager: number;
    platform_fee: number;
  };
}

type ToastType = "success" | "error";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SubscriptionDetailPage() {
  const { id: workspaceId } = useWorkspace();
  const params = useParams();
  const router = useRouter();
  const subscriptionPublicId = params.publicId as string;

  // Subscription list — used for the switcher dropdown
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const active = useMemo(
    () => subscriptions.find((s) => s.public_id === subscriptionPublicId) ?? null,
    [subscriptions, subscriptionPublicId],
  );

  // Workspace-scoped data
  const [bots, setBots] = useState<Bot[]>([]);
  const [accessSettings, setAccessSettings] = useState<AccessSettingsListItem[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Modal state
  const [showNewSubscription, setShowNewSubscription] = useState(false);
  const [showCapEditor, setShowCapEditor] = useState(false);
  const [justCreatedKey, setJustCreatedKey] = useState<{
    plaintext: string;
    accessSettingsId: string;
    label: string | null;
  } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKey | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Subscription | null>(null);
  const [expandedGrants, setExpandedGrants] = useState<Set<string>>(new Set());

  // -----------------------------------------------------------------------
  // Fetchers
  // -----------------------------------------------------------------------

  const fetchSubscriptions = useCallback(async () => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/subscriptions`);
    if (res.ok) {
      const items = (await res.json()) as Subscription[];
      setSubscriptions(items);
    }
  }, [workspaceId]);

  const fetchBots = useCallback(async () => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/bots`);
    if (res.ok) setBots(await res.json());
  }, [workspaceId]);

  const fetchAccessSettings = useCallback(async () => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/access-settings`);
    if (res.ok) {
      const body = (await res.json()) as { items: AccessSettingsListItem[] };
      setAccessSettings(body.items ?? []);
    }
  }, [workspaceId]);

  const activeId = active?.id;

  const fetchApiKeys = useCallback(async () => {
    if (!activeId) {
      setApiKeys([]);
      return;
    }
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/api-keys?subscription_id=${activeId}`,
    );
    if (res.ok) setApiKeys(await res.json());
    else setApiKeys([]);
  }, [workspaceId, activeId]);

  const fetchGrants = useCallback(async () => {
    if (!activeId) {
      setGrants([]);
      return;
    }
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/subscriptions/${activeId}/transactions`,
    );
    if (res.ok) {
      const body = (await res.json()) as { items: Grant[] };
      setGrants(body.items ?? []);
    } else {
      setGrants([]);
    }
  }, [workspaceId, activeId]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    Promise.all([fetchSubscriptions(), fetchBots(), fetchAccessSettings()])
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [fetchSubscriptions, fetchBots, fetchAccessSettings]);

  useEffect(() => {
    void fetchApiKeys();
    void fetchGrants();
  }, [fetchApiKeys, fetchGrants]);

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------

  const plansByBot = useMemo(() => {
    const map = new Map<string, AccessSettingsListItem[]>();
    for (const plan of accessSettings) {
      const list = map.get(plan.bot_id) ?? [];
      list.push(plan);
      map.set(plan.bot_id, list);
    }
    return map;
  }, [accessSettings]);

  const keysByPlan = useMemo(() => {
    const map = new Map<string, ApiKey[]>();
    for (const key of apiKeys) {
      const list = map.get(key.access_settings_id) ?? [];
      list.push(key);
      map.set(key.access_settings_id, list);
    }
    return map;
  }, [apiKeys]);

  // -----------------------------------------------------------------------
  // Side effects
  // -----------------------------------------------------------------------

  const createSubscription = async (label: string, externalId: string) => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label || undefined,
        external_user_id: externalId || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to create subscription", "error");
      return;
    }
    const created = (await res.json()) as Subscription;
    setShowNewSubscription(false);
    router.push(`/dashboard/publisher/distribute/subscriptions/${created.public_id}`);
  };

  const updateMonthlyCap = async (capEur: number | null) => {
    if (!active) return;
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/subscriptions/${active.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_cap_eur: capEur }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to update monthly cap", "error");
      return;
    }
    setShowCapEditor(false);
    await fetchSubscriptions();
    showToast("Monthly cap updated", "success");
  };

  const archiveSubscription = async (sub: Subscription) => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/subscriptions/${sub.id}`,
      { method: "DELETE" },
    );
    setConfirmArchive(null);
    if (res.ok) {
      const remaining = subscriptions.filter((s) => s.id !== sub.id);
      showToast("Subscription archived", "success");
      if (remaining.length > 0) {
        router.push(`/dashboard/publisher/distribute/subscriptions/${remaining[0].public_id}`);
      } else {
        router.push("/dashboard/publisher/distribute/subscriptions");
      }
    } else {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to archive subscription", "error");
    }
  };

  const issueKey = async (plan: AccessSettingsListItem) => {
    if (!active) return;
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription_id: active.id,
        access_settings_id: plan.id,
        label: plan.name,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to issue key", "error");
      return;
    }
    const payload = (await res.json()) as { api_key: string; record: ApiKey };
    setJustCreatedKey({ plaintext: payload.api_key, accessSettingsId: plan.id, label: plan.name });
    setApiKeys((prev) => [payload.record, ...prev]);
    await fetchSubscriptions();
  };

  const rotateKey = async (key: ApiKey) => {
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/api-keys/${key.id}/rotate`,
      { method: "POST" },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to rotate key", "error");
      return;
    }
    const payload = (await res.json()) as { api_key: string; record: ApiKey };
    setJustCreatedKey({ plaintext: payload.api_key, accessSettingsId: key.access_settings_id, label: key.label });
    setApiKeys((prev) => prev.map((k) => (k.id === key.id ? payload.record : k)));
  };

  const revokeKey = async (key: ApiKey) => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/api-keys/${key.id}`, {
      method: "DELETE",
    });
    setConfirmRevoke(null);
    if (res.ok) {
      setApiKeys((prev) => prev.filter((k) => k.id !== key.id));
      await fetchSubscriptions();
      showToast("API key revoked", "success");
    } else {
      showToast("Failed to revoke key", "error");
    }
  };

  const toggleGrantExpansion = (grantId: string) => {
    setExpandedGrants((prev) => {
      const next = new Set(prev);
      if (next.has(grantId)) next.delete(grantId); else next.add(grantId);
      return next;
    });
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-8">
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

      {/* Back link */}
      <div>
        <Link
          href="/dashboard/publisher/distribute/subscriptions"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Subscriptions
        </Link>
      </div>

      <Header
        subscriptions={subscriptions}
        active={active}
        loading={loading}
        onSelect={(publicId) => router.push(`/dashboard/publisher/distribute/subscriptions/${publicId}`)}
        onNewSubscription={() => setShowNewSubscription(true)}
        onEditCap={() => setShowCapEditor(true)}
        onArchive={() => active && setConfirmArchive(active)}
      />

      {active && (
        <>
          <IntegrationsSection
            bots={bots}
            plansByBot={plansByBot}
            keysByPlan={keysByPlan}
            justCreatedKey={justCreatedKey}
            onCreateIntegration={() =>
              router.push(
                `/dashboard/publisher/distribute/access-settings/new?subscription_id=${active.public_id}`,
              )
            }
            onIssueKey={issueKey}
            onRotateKey={rotateKey}
            onRevokeKey={(key) => setConfirmRevoke(key)}
            onClearJustCreatedKey={() => setJustCreatedKey(null)}
          />
          <RecentActivity
            grants={grants}
            expanded={expandedGrants}
            onToggle={toggleGrantExpansion}
          />
        </>
      )}

      {!active && !loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500 mb-3">Subscription not found</p>
          <Button href="/dashboard/publisher/distribute/subscriptions">
            Back to list
          </Button>
        </div>
      )}

      {/* Modals */}
      {showNewSubscription && (
        <NewSubscriptionModal
          onClose={() => setShowNewSubscription(false)}
          onSubmit={createSubscription}
        />
      )}

      {showCapEditor && active && (
        <MonthlyCapModal
          subscription={active}
          onClose={() => setShowCapEditor(false)}
          onSubmit={updateMonthlyCap}
        />
      )}

      <ConfirmDialog
        open={!!confirmRevoke}
        title="Revoke API key"
        description={`Revoke ${confirmRevoke?.api_key_prefix ?? ""}… ? This cannot be undone.`}
        confirmLabel="Revoke"
        variant="danger"
        onConfirm={() => confirmRevoke && revokeKey(confirmRevoke)}
        onCancel={() => setConfirmRevoke(null)}
      />
      <ConfirmDialog
        open={!!confirmArchive}
        title="Archive subscription"
        description="All API keys under this subscription will be revoked. The workspace wallet is untouched."
        confirmLabel="Archive"
        variant="danger"
        onConfirm={() => confirmArchive && archiveSubscription(confirmArchive)}
        onCancel={() => setConfirmArchive(null)}
      />
    </div>
  );
}

// ===========================================================================
// Header
// ===========================================================================

function nextMonthResetUtc(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)
  );
  return next.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Header({
  subscriptions,
  active,
  loading,
  onSelect,
  onNewSubscription,
  onEditCap,
  onArchive,
}: {
  subscriptions: Subscription[];
  active: Subscription | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNewSubscription: () => void;
  onEditCap: () => void;
  onArchive: () => void;
}) {
  const cap = active?.monthly_cap_eur;
  const spent = active?.current_month_spent_eur ?? 0;
  const ratio = cap !== null && cap !== undefined && cap > 0 ? Math.min(1, spent / cap) : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {subscriptions.length > 0 ? (
            <select
              value={active?.public_id ?? ""}
              onChange={(e) => onSelect(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              {subscriptions.map((s) => (
                <option key={s.id} value={s.public_id}>
                  {s.label ?? "Unlabeled"}
                  {s.archived_at ? " (archived)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-500">
              {loading ? "Loading subscriptions…" : "No subscription yet"}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={onNewSubscription}>
            + New
          </Button>
        </div>

        {active && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-500">This month</div>
              <div className="font-mono text-xl font-semibold text-gray-900">
                €{spent.toFixed(4)}
                <span className="text-sm text-gray-400">
                  {" "}/ {cap === null || cap === undefined ? "no cap" : `€${cap.toFixed(2)}`}
                </span>
              </div>
              {cap !== null && cap !== undefined && cap > 0 && (
                <div className="mt-1 h-1.5 w-40 rounded bg-gray-100">
                  <div
                    className="h-full rounded bg-blue-500"
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              )}
              <div className="mt-1 text-[11px] text-gray-400">
                Resets {nextMonthResetUtc()} UTC
              </div>
            </div>
            <Button onClick={onEditCap}>Edit cap</Button>
            <Button
              variant="secondary"
              onClick={onArchive}
              disabled={!!active.archived_at}
            >
              Archive
            </Button>
          </div>
        )}
      </div>

      {active && (active.external_user_id || active.created_at) && (
        <div className="mt-3 flex gap-4 text-xs text-gray-500">
          {active.external_user_id && <span>{active.external_user_id}</span>}
          {active.created_at && (
            <span>Created {new Date(active.created_at).toLocaleDateString()}</span>
          )}
          <span>{active.active_keys} active key{active.active_keys !== 1 ? "s" : ""}</span>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Integrations section
// ===========================================================================

function IntegrationsSection({
  bots, plansByBot, keysByPlan, justCreatedKey,
  onCreateIntegration, onIssueKey, onRotateKey, onRevokeKey,
  onClearJustCreatedKey,
}: {
  bots: Bot[];
  plansByBot: Map<string, AccessSettingsListItem[]>;
  keysByPlan: Map<string, ApiKey[]>;
  justCreatedKey: { plaintext: string; accessSettingsId: string; label: string | null } | null;
  onCreateIntegration: () => void;
  onIssueKey: (plan: AccessSettingsListItem) => void;
  onRotateKey: (key: ApiKey) => void;
  onRevokeKey: (key: ApiKey) => void;
  onClearJustCreatedKey: () => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Integrations</h2>
        <Button size="sm" onClick={onCreateIntegration}>
          + Create integration
        </Button>
      </div>

      {bots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          No integrations yet. Create one to start issuing API keys.
        </div>
      ) : (
        <div className="space-y-3">
          {bots.map((bot) => (
            <IntegrationCard
              key={bot.id}
              bot={bot}
              plans={plansByBot.get(bot.id) ?? []}
              keysByPlan={keysByPlan}
              justCreatedKey={justCreatedKey}
              onIssueKey={onIssueKey}
              onRotateKey={onRotateKey}
              onRevokeKey={onRevokeKey}
              onClearJustCreatedKey={onClearJustCreatedKey}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function IntegrationCard({
  bot, plans, keysByPlan, justCreatedKey,
  onIssueKey, onRotateKey, onRevokeKey, onClearJustCreatedKey,
}: {
  bot: Bot;
  plans: AccessSettingsListItem[];
  keysByPlan: Map<string, ApiKey[]>;
  justCreatedKey: { plaintext: string; accessSettingsId: string; label: string | null } | null;
  onIssueKey: (plan: AccessSettingsListItem) => void;
  onRotateKey: (key: ApiKey) => void;
  onRevokeKey: (key: ApiKey) => void;
  onClearJustCreatedKey: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{bot.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                bot.type === "preset"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-purple-50 text-purple-700"
              }`}
            >
              {bot.type}
            </span>
            <span className="font-mono text-xs text-gray-500">{bot.ua_pattern}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {bot.declared_ips.length} declared IP range
            {bot.declared_ips.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="mt-3 text-xs text-gray-500 italic">
          No plan yet for this integration. Manage plans from the Integrations page.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              keys={keysByPlan.get(plan.id) ?? []}
              justCreatedKey={justCreatedKey?.accessSettingsId === plan.id ? justCreatedKey : null}
              onIssueKey={() => onIssueKey(plan)}
              onRotateKey={onRotateKey}
              onRevokeKey={onRevokeKey}
              onClearJustCreatedKey={onClearJustCreatedKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanRow({
  plan, keys, justCreatedKey,
  onIssueKey, onRotateKey, onRevokeKey, onClearJustCreatedKey,
}: {
  plan: AccessSettingsListItem;
  keys: ApiKey[];
  justCreatedKey: { plaintext: string; label: string | null } | null;
  onIssueKey: () => void;
  onRotateKey: (key: ApiKey) => void;
  onRevokeKey: (key: ApiKey) => void;
  onClearJustCreatedKey: () => void;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">{plan.name}</div>
          <div className="mt-0.5 text-xs text-gray-500">
            {plan.catalog_count} catalog{plan.catalog_count !== 1 ? "s" : ""} ·{" "}
            {plan.max_price_eur === null
              ? "no price cap"
              : `max €${plan.max_price_eur.toFixed(4)} / grant`}
          </div>
        </div>
        {keys.length === 0 ? (
          <Button size="sm" onClick={onIssueKey}>Get key</Button>
        ) : (
          <span className="text-xs text-gray-500">{keys.length} key{keys.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {justCreatedKey && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900">
              Copy this key now — it will not be shown again.
            </span>
            <button type="button" onClick={onClearJustCreatedKey} className="text-amber-700 hover:text-amber-900 text-sm leading-none" aria-label="Dismiss">✕</button>
          </div>
          <code className="block break-all rounded bg-amber-100 p-2 font-mono text-xs text-amber-900">
            {justCreatedKey.plaintext}
          </code>
        </div>
      )}

      {keys.length > 0 && (
        <div className="mt-3 space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-700">{key.api_key_prefix}…</span>
                  {key.label && <span className="text-sm text-gray-900">{key.label}</span>}
                </div>
                {key.created_at && (
                  <div className="text-xs text-gray-500">
                    Issued {new Date(key.created_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => onRotateKey(key)}>Rotate</Button>
                <Button size="sm" variant="secondary" onClick={() => onRevokeKey(key)}>Revoke</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Recent activity
// ===========================================================================

function RecentActivity({ grants, expanded, onToggle }: {
  grants: Grant[];
  expanded: Set<string>;
  onToggle: (grantId: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Recent activity</h2>

      {grants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          No grants yet. Issue an API key and call /licenses to see activity here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">URL</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Catalog</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Cost</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {grants.map((g) => (
                <FragmentRow key={g.grant_id} grant={g} isOpen={expanded.has(g.grant_id)} onToggle={() => onToggle(g.grant_id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FragmentRow({ grant, isOpen, onToggle }: { grant: Grant; isOpen: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{new Date(grant.created_at).toLocaleString()}</td>
        <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate" title={grant.url}>{grant.url}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{grant.catalog_name ?? "—"}</td>
        <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">€{Math.abs(grant.total_eur).toFixed(4)}</td>
        <td className="px-4 py-3 text-right">
          <button type="button" onClick={onToggle} className="text-xs text-blue-600 hover:text-blue-800">
            {isOpen ? "Hide split" : "Show split"}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-gray-50">
          <td colSpan={5} className="px-4 py-3 text-xs text-gray-600">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-gray-500 uppercase">Content owner (85%)</div>
                <div className="mt-0.5 font-mono text-gray-900">€{grant.split.content_owner.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-gray-500 uppercase">Sub-manager (7%)</div>
                <div className="mt-0.5 font-mono text-gray-900">€{grant.split.sub_manager.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-gray-500 uppercase">Platform (8%)</div>
                <div className="mt-0.5 font-mono text-gray-900">€{grant.split.platform_fee.toFixed(4)}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ===========================================================================
// Generic modal chrome
// ===========================================================================

function CompactModal({ title, children, onClose, width = "max-w-md" }: {
  title: string; children: React.ReactNode; onClose: () => void; width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`w-full ${width} rounded-lg bg-white shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ===========================================================================
// New subscription / top up
// ===========================================================================

function NewSubscriptionModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (label: string, externalId: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [externalId, setExternalId] = useState("");
  return (
    <CompactModal title="New subscription" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(label, externalId); }} className="space-y-4">
        <Field label="Label (optional)">
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Acme Corp wallet"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </Field>
        <Field label="External user ID (optional)">
          <input type="text" value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="Your internal customer id"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Create</Button>
        </div>
      </form>
    </CompactModal>
  );
}

function MonthlyCapModal({ subscription, onClose, onSubmit }: {
  subscription: Subscription;
  onClose: () => void;
  onSubmit: (capEur: number | null) => void;
}) {
  const initial = subscription.monthly_cap_eur;
  const [unlimited, setUnlimited] = useState(initial === null);
  const [amount, setAmount] = useState(initial === null ? "" : String(initial));

  return (
    <CompactModal title={`Monthly cap — ${subscription.label ?? "subscription"}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (unlimited) {
            onSubmit(null);
            return;
          }
          const v = Number(amount);
          if (!Number.isFinite(v) || v < 0) return;
          onSubmit(v);
        }}
        className="space-y-4"
      >
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => setUnlimited(e.target.checked)}
          />
          No cap (spend up to the workspace balance)
        </label>
        <Field label="Cap (EUR / calendar month)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            disabled={unlimited}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
          />
        </Field>
        <p className="text-xs text-gray-500">
          Resets at 00:00 UTC on the 1st. Spend already accrued this month counts
          against the new cap.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </CompactModal>
  );
}

// ===========================================================================
// Misc
// ===========================================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 font-medium text-gray-700">{label}</div>
      {children}
    </label>
  );
}
