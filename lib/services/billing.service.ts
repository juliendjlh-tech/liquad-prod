// ---------------------------------------------------------------------------
// Billing service — Stripe wrapper
//
// Two surfaces:
//   1. One-shot top-ups via Stripe Checkout (mode=payment). Credits the
//      workspace wallet on checkout.session.completed.
//   2. Recurring subscriptions via Stripe Checkout (mode=subscription).
//      Tracked in billing_subscriptions, credits the wallet on each
//      invoice.paid.
//
// Idempotency is enforced at the DB level by credit_transactions.external_ref
// (UNIQUE index added in migration 047). Webhooks can be replayed safely.
//
// The Stripe Customer is created lazily and stored on
// workspaces.stripe_customer_id so the user's payment methods and invoices
// stay tied to the workspace across surfaces.
// ---------------------------------------------------------------------------

import Stripe from "stripe";
import { createServerClient } from "@/lib/db/supabase-server";

// ---------------------------------------------------------------------------
// SDK singleton
// ---------------------------------------------------------------------------
// We let the SDK pin its own apiVersion so the typings and the wire format
// stay aligned. Upgrading the SDK is the explicit way to upgrade the API
// version.

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripeClient = new Stripe(key);
  return stripeClient;
}

// ---------------------------------------------------------------------------
// Customer resolution
// ---------------------------------------------------------------------------

async function getOrCreateStripeCustomer(
  workspaceId: string,
  ownerEmail: string | null
): Promise<string> {
  const supabase = await createServerClient();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, stripe_customer_id")
    .eq("id", workspaceId)
    .single();

  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
  if (workspace.stripe_customer_id) return workspace.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: ownerEmail ?? undefined,
    name: workspace.name ?? undefined,
    metadata: { workspace_id: workspaceId },
  });

  const { error } = await supabase
    .from("workspaces")
    .update({ stripe_customer_id: customer.id })
    .eq("id", workspaceId);

  if (error) throw new Error(`CUSTOMER_PERSIST_FAILED: ${error.message}`);

  return customer.id;
}

// ---------------------------------------------------------------------------
// Checkout: one-shot top-up
// ---------------------------------------------------------------------------

export interface CreateTopupCheckoutInput {
  workspaceId: string;
  amountEur: number;
  ownerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
}

export async function createTopupCheckoutSession(
  input: CreateTopupCheckoutInput
): Promise<{ url: string }> {
  if (!Number.isFinite(input.amountEur) || input.amountEur <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const customerId = await getOrCreateStripeCustomer(input.workspaceId, input.ownerEmail);
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: Math.round(input.amountEur * 100),
          product_data: { name: "Workspace credits top-up" },
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      workspace_id: input.workspaceId,
      kind: "topup",
      amount_eur: String(input.amountEur),
    },
    payment_intent_data: {
      metadata: {
        workspace_id: input.workspaceId,
        kind: "topup",
      },
    },
  });

  if (!session.url) throw new Error("CHECKOUT_URL_MISSING");
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Checkout: recurring subscription
// ---------------------------------------------------------------------------

export interface CreateSubscribeCheckoutInput {
  workspaceId: string;
  priceId: string;
  ownerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
}

export async function createSubscribeCheckoutSession(
  input: CreateSubscribeCheckoutInput
): Promise<{ url: string }> {
  const customerId = await getOrCreateStripeCustomer(input.workspaceId, input.ownerEmail);
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      workspace_id: input.workspaceId,
      kind: "subscribe",
    },
    subscription_data: {
      metadata: {
        workspace_id: input.workspaceId,
        kind: "subscribe",
      },
    },
  });

  if (!session.url) throw new Error("CHECKOUT_URL_MISSING");
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Customer Portal
// ---------------------------------------------------------------------------

export async function createBillingPortalSession(
  workspaceId: string,
  returnUrl: string,
  ownerEmail: string | null
): Promise<{ url: string }> {
  const customerId = await getOrCreateStripeCustomer(workspaceId, ownerEmail);
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Webhook helpers — workspace resolution from Stripe object metadata
// ---------------------------------------------------------------------------

function readWorkspaceId(metadata: Stripe.Metadata | null | undefined): string | null {
  return metadata?.workspace_id ?? null;
}

async function workspaceIdForCustomer(stripeCustomerId: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Webhook: credit workspace for an invoice payment
// ---------------------------------------------------------------------------

export async function creditWorkspaceFromInvoice(invoice: Stripe.Invoice): Promise<void> {
  // Resolve workspace: prefer the subscription metadata (set at subscribe time),
  // fall back to the customer lookup. The `subscription` field has moved
  // between Stripe API versions; the cast keeps both shapes valid.
  let workspaceId: string | null = null;
  const invoiceSub = (invoice as unknown as {
    subscription?: string | { id?: string } | null;
  }).subscription;
  const subscriptionId =
    typeof invoiceSub === "string" ? invoiceSub : invoiceSub?.id ?? null;

  if (subscriptionId) {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    workspaceId = readWorkspaceId(sub.metadata);
  }

  if (!workspaceId) {
    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
    if (customerId) workspaceId = await workspaceIdForCustomer(customerId);
  }

  if (!workspaceId) throw new Error(`workspace_id missing for invoice ${invoice.id}`);

  const amountEur = (invoice.amount_paid ?? 0) / 100;
  if (amountEur <= 0) return;

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("credit_workspace", {
    p_workspace_id: workspaceId,
    p_amount_eur: amountEur,
    p_external_ref: invoice.id,
    p_description: "Recurring credit (Stripe invoice)",
    p_subscription_id: null,
  });
  if (error) throw new Error(`credit_workspace failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Webhook: credit workspace for a one-shot Checkout payment
// ---------------------------------------------------------------------------

export async function creditWorkspaceFromTopup(
  session: Stripe.Checkout.Session
): Promise<void> {
  const workspaceId = readWorkspaceId(session.metadata);
  if (!workspaceId) throw new Error(`workspace_id missing for session ${session.id}`);

  // amount_total is in minor units (cents). Trust the session figure rather
  // than the metadata to avoid client-side tampering.
  const amountEur = (session.amount_total ?? 0) / 100;
  if (amountEur <= 0) return;

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("credit_workspace", {
    p_workspace_id: workspaceId,
    p_amount_eur: amountEur,
    p_external_ref: session.id,
    p_description: "Top-up (Stripe Checkout)",
    p_subscription_id: null,
  });
  if (error) throw new Error(`credit_workspace failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Webhook: sync billing_subscriptions on customer.subscription.* events
// ---------------------------------------------------------------------------

export async function syncBillingSubscription(sub: Stripe.Subscription): Promise<void> {
  const workspaceId = readWorkspaceId(sub.metadata);
  if (!workspaceId) throw new Error(`workspace_id missing for subscription ${sub.id}`);

  const item = sub.items.data[0];
  if (!item) throw new Error(`subscription ${sub.id} has no items`);

  const priceId = item.price.id;
  const unitAmount = item.price.unit_amount ?? 0;
  const monthlyCreditEur = unitAmount / 100;

  // current_period_end moved between Stripe API versions. Cast through unknown
  // and accept either the legacy top-level field or the new one on the item.
  const periodEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (item as unknown as { current_period_end?: number }).current_period_end ??
    null;

  const supabase = await createServerClient();

  // Persist or update. UNIQUE(workspace_id) at MVP — upserting on
  // stripe_subscription_id keeps state aligned even after an upgrade.
  const { error } = await supabase.from("billing_subscriptions").upsert(
    {
      workspace_id: workspaceId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      monthly_credit_amount_eur: monthlyCreditEur,
      stripe_price_id: priceId,
      cancel_at_period_end: sub.cancel_at_period_end,
    },
    { onConflict: "workspace_id" }
  );

  if (error) throw new Error(`billing_subscriptions upsert failed: ${error.message}`);
}

export async function markBillingSubscriptionPastDue(
  stripeSubscriptionId: string
): Promise<void> {
  const supabase = await createServerClient();
  await supabase
    .from("billing_subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", stripeSubscriptionId);
}

export async function markBillingSubscriptionCanceled(
  stripeSubscriptionId: string
): Promise<void> {
  const supabase = await createServerClient();
  await supabase
    .from("billing_subscriptions")
    .update({ status: "canceled", cancel_at_period_end: false })
    .eq("stripe_subscription_id", stripeSubscriptionId);
}
