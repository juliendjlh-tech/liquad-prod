"use client";

// ---------------------------------------------------------------------------
// Workspace billing settings
//
// Surfaces the workspace wallet balance + the Stripe recurring subscription
// (if any). Users top up via Stripe Checkout (one-shot) or subscribe to a
// recurring plan that credits the wallet at each renewal. Owners/admins can
// manage the active recurring plan via the Stripe Customer Portal.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

interface BillingState {
  balance_eur: number;
  stripe_customer_id: string | null;
  recurring: {
    status: string;
    current_period_end: string | null;
    monthly_credit_amount_eur: number;
    stripe_price_id: string;
    cancel_at_period_end: boolean;
  } | null;
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BillingSettingsPage() {
  const { id: workspaceId } = useWorkspace();
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("10");
  const [subscribePriceId, setSubscribePriceId] = useState(
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_RECURRING_DEFAULT ?? ""
  );
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/internal/workspaces/${workspaceId}/billing`);
      if (res.ok) setState(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const startTopup = async () => {
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a positive amount");
      return;
    }
    setBusy("topup");
    try {
      const returnTo = `${window.location.origin}/dashboard/publisher/distribute/billing`;
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/billing/checkout-topup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_eur: amount,
            success_url: `${returnTo}?topup=success`,
            cancel_url: `${returnTo}?topup=canceled`,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.message ?? body.error ?? "Top-up failed");
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } finally {
      setBusy(null);
    }
  };

  const startSubscribe = async () => {
    if (!subscribePriceId.trim()) {
      showToast("Set a Stripe price_id (env or input)");
      return;
    }
    setBusy("subscribe");
    try {
      const returnTo = `${window.location.origin}/dashboard/publisher/distribute/billing`;
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/billing/checkout-subscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            price_id: subscribePriceId.trim(),
            success_url: `${returnTo}?subscribe=success`,
            cancel_url: `${returnTo}?subscribe=canceled`,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.message ?? body.error ?? "Subscribe failed");
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    try {
      const returnTo = `${window.location.origin}/dashboard/publisher/distribute/billing`;
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/billing/portal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ return_url: returnTo }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.message ?? body.error ?? "Portal unavailable");
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading…</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-red-100 px-4 py-3 text-sm font-medium text-red-800 shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Billing</h1>
        <p className="text-sm text-gray-500">
          Top up the workspace wallet manually or subscribe to a recurring plan.
        </p>
      </div>

      {/* Past-due banner */}
      {state?.recurring?.status === "past_due" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold mb-1">Payment failed</div>
          Your recurring plan could not be charged. Update your card via Manage
          subscription to resume auto-recharge. Your API keys keep working while
          balance is available.
        </div>
      )}

      {/* Balance card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Workspace balance
        </div>
        <div className="mt-1 font-mono text-3xl font-semibold text-gray-900">
          {formatEur(state?.balance_eur ?? 0)}
        </div>
      </div>

      {/* One-shot top-up */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Add credits (one-shot)
        </h2>
        <div className="flex items-end gap-3">
          <label className="block text-sm">
            <div className="mb-1 font-medium text-gray-700">Amount (EUR)</div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <Button onClick={startTopup} loading={busy === "topup"}>
            Pay with Stripe
          </Button>
        </div>
      </div>

      {/* Recurring */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Recurring plan
        </h2>
        {state?.recurring ? (
          <div className="space-y-2">
            <div className="text-sm text-gray-700">
              <span className="font-medium">
                {formatEur(state.recurring.monthly_credit_amount_eur)}
              </span>
              {" / month — status: "}
              <span className="font-mono">{state.recurring.status}</span>
            </div>
            <div className="text-xs text-gray-500">
              Next renewal: {formatDate(state.recurring.current_period_end)}
              {state.recurring.cancel_at_period_end && " (will cancel)"}
            </div>
            <div className="pt-2">
              <Button onClick={openPortal} loading={busy === "portal"}>
                Manage in Stripe
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              No recurring plan. Subscribe to credit the wallet automatically at
              each renewal.
            </p>
            <div className="flex items-end gap-3">
              <label className="block text-sm flex-1 max-w-md">
                <div className="mb-1 font-medium text-gray-700">
                  Stripe price_id
                </div>
                <input
                  type="text"
                  value={subscribePriceId}
                  onChange={(e) => setSubscribePriceId(e.target.value)}
                  placeholder="price_..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
                />
              </label>
              <Button onClick={startSubscribe} loading={busy === "subscribe"}>
                Subscribe
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
