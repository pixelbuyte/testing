import { createHash } from "node:crypto";
import Stripe from "stripe";
import type { Interval } from "../money";
import type { SourceAccount, SourceCard, SourceInvoice, SourceSubscription, StripeSource, SubscriptionStatus } from "./types";

export class StripePermissionError extends Error {
  constructor(
    message: string,
    readonly missing: string,
  ) {
    super(message);
    this.name = "StripePermissionError";
  }
}

const isPermissionError = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { type?: string }).type === "invalid_request_error" && /permission|does not have access|restricted/i.test((e as { message?: string }).message ?? "");

function cardFrom(pm: Stripe.PaymentMethod | string | null | undefined): SourceCard | null {
  if (!pm || typeof pm === "string" || pm.type !== "card" || !pm.card) return null;
  return { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
}

function declineCodeFrom(invoice: Stripe.Invoice): string | null {
  const withPi = invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null };
  const pi = withPi.payment_intent;
  if (pi && typeof pi !== "string" && pi.last_payment_error) {
    return pi.last_payment_error.decline_code ?? pi.last_payment_error.code ?? null;
  }
  const attempt = (invoice as Stripe.Invoice & { last_finalization_error?: Stripe.Invoice.LastFinalizationError | null }).last_finalization_error;
  return attempt?.code ?? null;
}

function invoiceFrom(invoice: Stripe.Invoice | string | null | undefined): SourceInvoice | null {
  if (!invoice || typeof invoice === "string") return null;
  return {
    id: invoice.id ?? "",
    status: (invoice.status ?? "open") as SourceInvoice["status"],
    amountDueCents: invoice.amount_remaining ?? invoice.amount_due ?? 0,
    currency: invoice.currency ?? "usd",
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    attemptCount: invoice.attempt_count ?? 0,
    nextPaymentAttempt: invoice.next_payment_attempt ?? null,
    created: invoice.created ?? 0,
    declineCode: declineCodeFrom(invoice),
  };
}

function subscriptionFrom(sub: Stripe.Subscription): SourceSubscription {
  const customer = typeof sub.customer === "string" ? { id: sub.customer, email: null, name: null, created: sub.created } : { id: sub.customer.id, email: (sub.customer as Stripe.Customer).email ?? null, name: (sub.customer as Stripe.Customer).name ?? null, created: (sub.customer as Stripe.Customer).created ?? sub.created };

  return {
    id: sub.id,
    status: sub.status as SubscriptionStatus,
    customer,
    items: sub.items.data.map((item) => ({
      priceId: item.price.id,
      unitAmountCents: item.price.unit_amount ?? 0,
      interval: (item.price.recurring?.interval ?? "month") as Interval,
      intervalCount: item.price.recurring?.interval_count ?? 1,
      quantity: item.quantity ?? 1,
      nickname: item.price.nickname ?? null,
      productName: typeof item.price.product === "object" && item.price.product && !("deleted" in item.price.product) ? (item.price.product as Stripe.Product).name : null,
    })),
    currency: sub.currency,
    created: sub.created,
    canceledAt: sub.canceled_at ?? null,
    cancellationReason: sub.cancellation_details?.reason ?? null,
    latestInvoice: invoiceFrom(sub.latest_invoice),
    defaultCard: cardFrom(sub.default_payment_method as Stripe.PaymentMethod | string | null),
  };
}

const EXPAND = ["data.customer", "data.latest_invoice", "data.default_payment_method", "data.items.data.price.product"];

export class LiveStripe implements StripeSource {
  private client: Stripe;
  private keyFingerprint: string;
  private livemodeKey: boolean;

  constructor(secretKey: string) {
    this.client = new Stripe(secretKey, { apiVersion: "2026-08-26.dahlia", maxNetworkRetries: 2, timeout: 20_000 });
    this.keyFingerprint = createHash("sha256").update(secretKey).digest("hex").slice(0, 16);
    this.livemodeKey = secretKey.includes("_live_");
  }

  async verify(): Promise<SourceAccount> {
    const permissions = { subscriptions: false, invoices: false, customers: false, checkout: false };
    let accountId = "acct_unknown";
    let businessName = "Your product";
    let livemode = false;

    const probe = await this.client.subscriptions.list({ limit: 1 }).catch((e: unknown) => {
      if (isPermissionError(e)) throw new StripePermissionError("This key can't read subscriptions. Add the Subscriptions → Read permission.", "subscriptions");
      throw e;
    });
    permissions.subscriptions = true;
    livemode = probe.data[0]?.livemode ?? false;

    await this.client.invoices
      .list({ limit: 1 })
      .then(() => {
        permissions.invoices = true;
      })
      .catch(() => {});
    await this.client.customers
      .list({ limit: 1 })
      .then((r) => {
        permissions.customers = true;
        businessName = r.data[0]?.metadata?.business_name ?? businessName;
      })
      .catch(() => {});

    // A restricted key can't read the account object, so identity comes from the key itself.
    accountId = `acct_${this.keyFingerprint}`;
    livemode = this.livemodeKey || livemode;

    // Checkout write permission is probed lazily on first use to avoid creating junk sessions.
    permissions.checkout = true;
    return { accountId, businessName, livemode, permissions };
  }

  private async listByStatus(status: Stripe.SubscriptionListParams.Status, extra: Stripe.SubscriptionListParams = {}) {
    const out: SourceSubscription[] = [];
    for await (const sub of this.client.subscriptions.list({ status, limit: 100, expand: EXPAND, ...extra })) {
      out.push(subscriptionFrom(sub));
      if (out.length >= 1000) break;
    }
    return out;
  }

  async listSubscriptions(sinceUnix: number) {
    const [pastDue, unpaid, canceled, active, trialing] = await Promise.all([
      this.listByStatus("past_due"),
      this.listByStatus("unpaid"),
      this.listByStatus("canceled", { created: { gte: sinceUnix - 400 * 86_400 } }),
      this.listByStatus("active"),
      this.listByStatus("trialing"),
    ]);
    const recentlyCanceled = canceled.filter((s) => (s.canceledAt ?? 0) >= sinceUnix);
    return [...pastDue, ...unpaid, ...recentlyCanceled, ...active, ...trialing];
  }

  async getSubscription(id: string) {
    try {
      const sub = await this.client.subscriptions.retrieve(id, { expand: ["customer", "latest_invoice", "default_payment_method", "items.data.price.product"] });
      return subscriptionFrom(sub);
    } catch {
      return null;
    }
  }

  async getInvoice(id: string) {
    try {
      return invoiceFrom(await this.client.invoices.retrieve(id, { expand: ["payment_intent"] }));
    } catch {
      return null;
    }
  }

  async createReactivationUrl(customerId: string, priceIds: string[], successUrl: string) {
    try {
      const session = await this.client.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: priceIds.map((price) => ({ price, quantity: 1 })),
        success_url: successUrl,
        cancel_url: successUrl,
      });
      return session.url;
    } catch {
      return null;
    }
  }

  async createCardUpdateUrl(customerId: string, successUrl: string) {
    try {
      const session = await this.client.checkout.sessions.create({
        mode: "setup",
        customer: customerId,
        currency: "usd",
        success_url: successUrl,
        cancel_url: successUrl,
      });
      return session.url;
    } catch {
      return null;
    }
  }
}
