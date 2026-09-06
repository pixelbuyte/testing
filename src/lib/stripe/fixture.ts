import type { SourceAccount, SourceInvoice, SourceSubscription, StripeSource } from "./types";
import { buildFixtureSubscriptions, FIXTURE_ACCOUNT } from "./fixtures";

/**
 * In-memory Stripe stand-in used for the public demo and for local development.
 * Mutations (e.g. a customer paying) are recorded so the cron loop can observe recoveries.
 */
export class FixtureStripe implements StripeSource {
  private subs: SourceSubscription[];
  private static paid = new Set<string>();

  constructor(now?: number) {
    this.subs = buildFixtureSubscriptions(now);
  }

  static markPaid(subscriptionId: string) {
    FixtureStripe.paid.add(subscriptionId);
  }

  static reset() {
    FixtureStripe.paid.clear();
  }

  private withPayments(sub: SourceSubscription): SourceSubscription {
    if (!FixtureStripe.paid.has(sub.id)) return sub;
    return {
      ...sub,
      status: "active",
      canceledAt: null,
      cancellationReason: null,
      latestInvoice: sub.latestInvoice ? { ...sub.latestInvoice, status: "paid", amountDueCents: 0 } : null,
    };
  }

  async verify(): Promise<SourceAccount> {
    return { ...FIXTURE_ACCOUNT, permissions: { subscriptions: true, invoices: true, customers: true, checkout: true } };
  }

  async listSubscriptions(sinceUnix: number) {
    return this.subs.filter((s) => s.status !== "canceled" || (s.canceledAt ?? 0) >= sinceUnix).map((s) => this.withPayments(s));
  }

  async getSubscription(id: string) {
    const s = this.subs.find((x) => x.id === id);
    return s ? this.withPayments(s) : null;
  }

  async getInvoice(id: string): Promise<SourceInvoice | null> {
    const s = this.subs.find((x) => x.latestInvoice?.id === id);
    return s ? this.withPayments(s).latestInvoice : null;
  }

  async createReactivationUrl(customerId: string) {
    return `https://checkout.stripe.com/c/pay/demo_${customerId}`;
  }

  async createCardUpdateUrl(customerId: string) {
    return `https://checkout.stripe.com/c/setup/demo_${customerId}`;
  }
}

export const isDemoKey = (key: string) => key.trim().toLowerCase().startsWith("demo");
