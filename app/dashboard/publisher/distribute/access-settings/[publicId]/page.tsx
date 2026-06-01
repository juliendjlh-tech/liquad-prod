"use client";

// ---------------------------------------------------------------------------
// /dashboard/publisher/distribute/access-settings/[publicId]
//
// Bot detail (L2 of the Integrations page). One bot per page, identified by
// its public_id. Shows every access_settings (plan) on this bot in the
// workspace and lets you:
//   - issue an API key on a plan (subscription picked via combobox)
//   - rotate / revoke existing keys
//   - delete a plan (blocked while it has active keys)
//   - remove the bot from the workspace (cascade revoke + delete plans)
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";
import SubscriptionPicker from "@/app/components/SubscriptionPicker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Bot {
  id: string;
  public_id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: "preset" | "custom";
  description: string | null;
}

interface Plan {
  id: string;
  public_id: string;
  workspace_id: string;
  bot_id: string;
  name: string;
  max_price_eur: number | null;
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

interface SubscriptionLite {
  id: string;
  public_id: string;
  label: string | null;
}

type ToastType = "success" | "error";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IntegrationDetailPage() {
  const { id: workspaceId } = useWorkspace();
  const params = useParams();
  const router = useRouter();
  const botPublicId = params.publicId as string;

  const [bot, setBot] = useState<Bot | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [justCreatedKey, setJustCreatedKey] = useState<{
    plaintext: string;
    accessSettingsId: string;
    label: string | null;
  } | null>(null);

  const [confirmRevoke, setConfirmRevoke] = useState<ApiKey | null>(null);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState<Plan | null>(null);
  const [confirmRemoveBot, setConfirmRemoveBot] = useState(false);
  const [removingBot, setRemovingBot] = useState(false);

  // -----------------------------------------------------------------------
  // Fetchers
  // -----------------------------------------------------------------------

  const fetchBotAndPlans = useCallback(async () => {
    setLoading(true);
    try {
      const [botsRes, plansRes] = await Promise.all([
        fetch(`/api/internal/workspaces/${workspaceId}/bots`),
        fetch(`/api/internal/workspaces/${workspaceId}/access-settings`),
      ]);

      const allBots = botsRes.ok ? ((await botsRes.json()) as Bot[]) : [];
      const found = allBots.find((b) => b.public_id === botPublicId) ?? null;
      setBot(found);
      setNotFound(!found);

      if (!found) {
        setPlans([]);
        return;
      }

      const allPlans = plansRes.ok
        ? (((await plansRes.json()) as { items: Plan[] }).items ?? [])
        : [];
      setPlans(allPlans.filter((p) => p.bot_id === found.id));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, botPublicId]);

  const fetchKeys = useCallback(async () => {
    if (!bot) return;
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/api-keys`);
    if (!res.ok) {
      setKeys([]);
      return;
    }
    const all = (await res.json()) as ApiKey[];
    setKeys(all.filter((k) => k.bot_id === bot.id));
  }, [workspaceId, bot]);

  useEffect(() => {
    void fetchBotAndPlans();
  }, [fetchBotAndPlans]);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------

  const keysByPlan = useMemo(() => {
    const map = new Map<string, ApiKey[]>();
    for (const k of keys) {
      const list = map.get(k.access_settings_id) ?? [];
      list.push(k);
      map.set(k.access_settings_id, list);
    }
    return map;
  }, [keys]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const issueKey = async (planId: string, subscription: SubscriptionLite, label: string) => {
    const res = await fetch(`/api/internal/workspaces/${workspaceId}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription_id: subscription.id,
        access_settings_id: planId,
        label: label || subscription.public_id,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Failed to issue key", "error");
      return false;
    }
    const payload = (await res.json()) as { api_key: string; record: ApiKey };
    setJustCreatedKey({
      plaintext: payload.api_key,
      accessSettingsId: planId,
      label: payload.record.label,
    });
    setKeys((prev) => [payload.record, ...prev]);
    showToast("API key issued", "success");
    return true;
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
    setJustCreatedKey({
      plaintext: payload.api_key,
      accessSettingsId: key.access_settings_id,
      label: payload.record.label,
    });
    setKeys((prev) => prev.map((k) => (k.id === key.id ? payload.record : k)));
  };

  const revokeKey = async (key: ApiKey) => {
    setConfirmRevoke(null);
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/api-keys/${key.id}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
      showToast("API key revoked", "success");
    } else {
      showToast("Failed to revoke key", "error");
    }
  };

  const deletePlan = async (plan: Plan) => {
    setConfirmDeletePlan(null);
    const res = await fetch(
      `/api/internal/workspaces/${workspaceId}/access-settings/${plan.id}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      showToast("Plan deleted", "success");
    } else {
      const body = await res.json().catch(() => ({}));
      showToast(body.message ?? body.error ?? "Failed to delete plan", "error");
    }
  };

  const removeBotFromWorkspace = async () => {
    if (!bot) return;
    setRemovingBot(true);
    try {
      // 1. Revoke every active key on this bot.
      const activeKeys = keys.filter((k) => !k.revoked_at);
      for (const key of activeKeys) {
        const res = await fetch(
          `/api/internal/workspaces/${workspaceId}/api-keys/${key.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          showToast(`Failed to revoke key ${key.api_key_prefix}…`, "error");
          return;
        }
      }

      // 2. Delete every plan for this bot in this workspace.
      if (plans.length > 0) {
        const res = await fetch(
          `/api/internal/workspaces/${workspaceId}/access-settings`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: plans.map((p) => p.id) }),
          },
        );
        if (!res.ok) {
          showToast("Failed to delete plans", "error");
          return;
        }
        const body = (await res.json()) as {
          deleted: string[];
          blocked: Array<{ id: string; reason: string }>;
        };
        if (body.blocked.length > 0) {
          showToast(
            `${body.blocked.length} plan(s) could not be deleted — try again.`,
            "error",
          );
          return;
        }
      }

      // 3. Remove the bot from the workspace.
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/bots/${bot.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.message ?? body.error ?? "Failed to remove bot", "error");
        return;
      }

      router.push("/dashboard/publisher/distribute/access-settings");
    } finally {
      setRemovingBot(false);
      setConfirmRemoveBot(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading…
        </div>
      </div>
    );
  }

  if (notFound || !bot) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500 mb-3">Integration not found</p>
          <Button href="/dashboard/publisher/distribute/access-settings">
            Back to Integrations
          </Button>
        </div>
      </div>
    );
  }

  const activeKeyCount = keys.filter((k) => !k.revoked_at).length;

  return (
    <div className="space-y-6">
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

      <BackLink />

      <BotHeader
        bot={bot}
        planCount={plans.length}
        activeKeyCount={activeKeyCount}
        onAddPlan={() =>
          router.push(
            `/dashboard/publisher/distribute/access-settings/new?bot_public_id=${bot.public_id}`,
          )
        }
        onRemoveBot={() => setConfirmRemoveBot(true)}
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Plans</h2>
        </div>

        {plans.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            No plan yet for this bot.{" "}
            <Link
              href={`/dashboard/publisher/distribute/access-settings/new?bot_public_id=${bot.public_id}`}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Create one
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                keys={keysByPlan.get(plan.id) ?? []}
                workspaceId={workspaceId}
                justCreatedKey={
                  justCreatedKey?.accessSettingsId === plan.id ? justCreatedKey : null
                }
                onClearJustCreatedKey={() => setJustCreatedKey(null)}
                onIssueKey={(sub, label) => issueKey(plan.id, sub, label)}
                onRotateKey={rotateKey}
                onRevokeKey={(key) => setConfirmRevoke(key)}
                onDeletePlan={() => setConfirmDeletePlan(plan)}
              />
            ))}
          </div>
        )}
      </section>

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
        open={!!confirmDeletePlan}
        title={`Delete plan "${confirmDeletePlan?.name ?? ""}"?`}
        description="If this plan still has active API keys, the delete will be blocked — revoke them first."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDeletePlan && deletePlan(confirmDeletePlan)}
        onCancel={() => setConfirmDeletePlan(null)}
      />

      <ConfirmDialog
        open={confirmRemoveBot}
        title={`Remove ${bot.name} from workspace?`}
        description={
          plans.length === 0 && activeKeyCount === 0
            ? "This bot will be removed from the workspace."
            : `${plans.length} plan(s) will be deleted and ${activeKeyCount} active key(s) will be revoked. This cannot be undone.`
        }
        confirmLabel={removingBot ? "Removing…" : "Remove"}
        variant="danger"
        onConfirm={() => void removeBotFromWorkspace()}
        onCancel={() => setConfirmRemoveBot(false)}
      />
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function BackLink() {
  return (
    <Link
      href="/dashboard/publisher/distribute/access-settings"
      className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
    >
      ← Integrations
    </Link>
  );
}

function BotHeader({
  bot,
  planCount,
  activeKeyCount,
  onAddPlan,
  onRemoveBot,
}: {
  bot: Bot;
  planCount: number;
  activeKeyCount: number;
  onAddPlan: () => void;
  onRemoveBot: () => void;
}) {
  const [ipsExpanded, setIpsExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{bot.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                bot.type === "preset"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-purple-50 text-purple-700"
              }`}
            >
              {bot.type}
            </span>
            <span className="font-mono text-xs text-gray-500">{bot.public_id}</span>
          </div>
          {bot.description && (
            <p className="mt-2 text-sm text-gray-600 max-w-3xl">{bot.description}</p>
          )}
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2">
            <div>
              <span className="text-gray-500">UA pattern:</span>{" "}
              <span className="font-mono">{bot.ua_pattern}</span>
            </div>
            <div>
              <span className="text-gray-500">Declared IPs:</span>{" "}
              {bot.declared_ips.length === 0 ? (
                <span className="text-gray-400">—</span>
              ) : (
                <>
                  <span className="font-medium text-gray-900">
                    {bot.declared_ips.length}
                  </span>{" "}
                  <button
                    type="button"
                    onClick={() => setIpsExpanded((v) => !v)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {ipsExpanded ? "Hide" : "Show"}
                  </button>
                  {ipsExpanded && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 font-mono text-[11px] leading-snug text-gray-700">
                      {bot.declared_ips.join(", ")}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-4 text-xs text-gray-500">
            <span>
              {planCount} plan{planCount !== 1 ? "s" : ""}
            </span>
            <span>
              {activeKeyCount} active key{activeKeyCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onAddPlan}>
            + Add plan
          </Button>
          <Button size="sm" variant="secondary" onClick={onRemoveBot}>
            Remove from workspace
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  keys,
  workspaceId,
  justCreatedKey,
  onClearJustCreatedKey,
  onIssueKey,
  onRotateKey,
  onRevokeKey,
  onDeletePlan,
}: {
  plan: Plan;
  keys: ApiKey[];
  workspaceId: string;
  justCreatedKey: { plaintext: string; label: string | null } | null;
  onClearJustCreatedKey: () => void;
  onIssueKey: (sub: SubscriptionLite, label: string) => Promise<boolean>;
  onRotateKey: (key: ApiKey) => void;
  onRevokeKey: (key: ApiKey) => void;
  onDeletePlan: () => void;
}) {
  const [issuing, setIssuing] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<SubscriptionLite | null>(null);
  const [label, setLabel] = useState("");

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const canDelete = activeKeys.length === 0;

  const submitIssue = async () => {
    if (!selectedSub) return;
    setIssuing(true);
    try {
      const ok = await onIssueKey(selectedSub, label);
      if (ok) {
        setIssueOpen(false);
        setSelectedSub(null);
        setLabel("");
      }
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{plan.name}</span>
            <span className="font-mono text-[11px] text-gray-400">{plan.public_id}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {plan.catalog_count} catalog{plan.catalog_count !== 1 ? "s" : ""} ·{" "}
            {plan.max_price_eur === null
              ? "no price cap"
              : `max €${plan.max_price_eur.toFixed(4)} / grant`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onDeletePlan}
            disabled={!canDelete}
            title={
              canDelete
                ? "Delete this plan"
                : `Revoke ${activeKeys.length} active key${activeKeys.length !== 1 ? "s" : ""} first`
            }
          >
            Delete plan
          </Button>
          {!issueOpen && (
            <Button size="sm" onClick={() => setIssueOpen(true)}>
              + Issue key
            </Button>
          )}
        </div>
      </div>

      {issueOpen && (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50/40 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
            New API key
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-gray-700">
                Subscription public ID
              </div>
              <SubscriptionPicker
                workspaceId={workspaceId}
                value={selectedSub?.id ?? null}
                onChange={(sub) =>
                  setSelectedSub(
                    sub
                      ? { id: sub.id, public_id: sub.public_id, label: sub.label }
                      : null,
                  )
                }
                placeholder="sub_…"
                autoFocus
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-gray-700">
                Label (optional)
              </div>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={plan.name}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setIssueOpen(false);
                setSelectedSub(null);
                setLabel("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submitIssue}
              disabled={!selectedSub}
              loading={issuing}
            >
              Issue key
            </Button>
          </div>
        </div>
      )}

      {justCreatedKey && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900">
              Copy this key now — it will not be shown again.
            </span>
            <button
              type="button"
              onClick={onClearJustCreatedKey}
              className="text-amber-700 hover:text-amber-900 text-sm leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <code className="block break-all rounded bg-amber-100 p-2 font-mono text-xs text-amber-900">
            {justCreatedKey.plaintext}
          </code>
        </div>
      )}

      {keys.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Keys ({activeKeys.length})
          </div>
          <div className="space-y-2">
            {activeKeys.map((key) => (
              <KeyRow
                key={key.id}
                k={key}
                onRotate={() => onRotateKey(key)}
                onRevoke={() => onRevokeKey(key)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KeyRow({
  k,
  onRotate,
  onRevoke,
}: {
  k: ApiKey;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-700">{k.api_key_prefix}…</span>
          {k.label && <span className="text-sm text-gray-900">{k.label}</span>}
        </div>
        <div className="mt-0.5 text-xs text-gray-500">
          {k.subscription_public_id && (
            <>
              <Link
                href={`/dashboard/publisher/distribute/subscriptions/${k.subscription_public_id}`}
                className="text-blue-600 hover:text-blue-800"
                onClick={(e) => e.stopPropagation()}
              >
                {k.subscription_label ?? k.subscription_public_id}
              </Link>
              {" · "}
            </>
          )}
          {k.created_at && (
            <>Issued {new Date(k.created_at).toLocaleDateString()}</>
          )}
          {k.last_used_at && (
            <> · last used {new Date(k.last_used_at).toLocaleDateString()}</>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onRotate}>
          Rotate
        </Button>
        <Button size="sm" variant="secondary" onClick={onRevoke}>
          Revoke
        </Button>
      </div>
    </div>
  );
}
