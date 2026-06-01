import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  creditWorkspaceFromInvoice,
  creditWorkspaceFromTopup,
  syncBillingSubscription,
  markBillingSubscriptionPastDue,
  markBillingSubscriptionCanceled,
} from "@/lib/services/billing.service";

/**
 * POST /api/webhooks/stripe
 *
 * Stripe sends events here. We verify the signature against the raw request
 * body (Next.js does NOT auto-parse JSON if we call request.text() first),
 * then dispatch on event type. Idempotency is at the DB level via
 * credit_transactions.external_ref (UNIQUE), so retries are safe.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: "signature verification failed", message: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.payment_status === "paid") {
          await creditWorkspaceFromTopup(session);
        }
        // mode=subscription: do nothing here. The recurring credit lands on
        // invoice.paid; the billing_subscriptions row is created/updated by
        // customer.subscription.created/updated.
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await creditWorkspaceFromInvoice(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceSub = (invoice as unknown as {
          subscription?: string | { id?: string } | null;
        }).subscription;
        const subId =
          typeof invoiceSub === "string" ? invoiceSub : invoiceSub?.id ?? null;
        if (subId) await markBillingSubscriptionPastDue(subId);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncBillingSubscription(sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await markBillingSubscriptionCanceled(sub.id);
        break;
      }

      default:
        // Ignore unhandled event types. Stripe expects 2xx on any non-failed
        // delivery so it doesn't retry indefinitely.
        break;
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: "handler_failed",
        type: event.type,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
