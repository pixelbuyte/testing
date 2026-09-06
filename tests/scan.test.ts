import { describe, expect, it } from "vitest";
import { classify, EXPIRY_WINDOW_DAYS, LOST_WINDOW_DAYS, scan } from "@/lib/recovery/scan";
import { FixtureStripe } from "@/lib/stripe/fixture";
import { buildFixtureSubscriptions } from "@/lib/stripe/fixtures";
import type { SourceSubscription } from "@/lib/stripe/types";

const NOW = 1_770_000_000;
const DAY = 86_400;

function sub(overrides: Partial<SourceSubscription> = {}): SourceSubscription {
  return {
    id: "sub_1",
    status: "active",
    customer: { id: "cus_1", email: "a@b.com", name: "Ada Lovelace", created: NOW - 365 * DAY },
    items: [{ priceId: "price_1", unitAmountCents: 5000, interval: "month", intervalCount: 1, quantity: 1, nickname: "Pro", productName: "Thing" }],
    currency: "usd",
    created: NOW - 365 * DAY,
    canceledAt: null,
    cancellationReason: null,
    latestInvoice: null,
    defaultCard: null,
    ...overrides,
  };
}

describe("classify", () => {
  it("puts past_due subscriptions in the at-risk bucket with the invoice amount", () => {
    const result = classify(
      [
        sub({
          status: "past_due",
          latestInvoice: { id: "in_1", status: "open", amountDueCents: 5000, currency: "usd", hostedInvoiceUrl: "https://x", attemptCount: 2, nextPaymentAttempt: NOW + 2 * DAY, created: NOW - 4 * DAY, declineCode: "expired_card" },
        }),
      ],
      NOW,
    );
    expect(result.atRisk).toHaveLength(1);
    expect(result.atRisk[0].amountCents).toBe(5000);
    expect(result.atRisk[0].daysOverdue).toBe(4);
    expect(result.atRisk[0].stripeGaveUp).toBe(false);
    expect(result.totals.atRiskCents).toBe(5000);
  });

  it("marks unpaid subscriptions as ones Stripe gave up on", () => {
    const result = classify(
      [
        sub({
          status: "unpaid",
          latestInvoice: { id: "in_1", status: "open", amountDueCents: 5000, currency: "usd", hostedInvoiceUrl: null, attemptCount: 4, nextPaymentAttempt: null, created: NOW - 20 * DAY, declineCode: null },
        }),
      ],
      NOW,
    );
    expect(result.atRisk[0].stripeGaveUp).toBe(true);
  });

  it("counts only payment-failure cancellations as lost", () => {
    const result = classify(
      [
        sub({ id: "s1", status: "canceled", canceledAt: NOW - 10 * DAY, cancellationReason: "payment_failed" }),
        sub({ id: "s2", status: "canceled", canceledAt: NOW - 10 * DAY, cancellationReason: "cancellation_requested" }),
      ],
      NOW,
    );
    expect(result.lost.map((c) => c.subscriptionId)).toEqual(["s1"]);
  });

  it("ignores payment-failure cancellations older than the lookback window", () => {
    const result = classify([sub({ status: "canceled", canceledAt: NOW - (LOST_WINDOW_DAYS + 5) * DAY, cancellationReason: "payment_failed" })], NOW);
    expect(result.lost).toHaveLength(0);
  });

  it("flags a card expiring inside the window but not one beyond it", () => {
    const soon = new Date((NOW + 10 * DAY) * 1000);
    const later = new Date((NOW + 200 * DAY) * 1000);
    const result = classify(
      [
        sub({ id: "s1", defaultCard: { brand: "visa", last4: "1111", expMonth: soon.getUTCMonth() + 1, expYear: soon.getUTCFullYear() } }),
        sub({ id: "s2", defaultCard: { brand: "visa", last4: "2222", expMonth: later.getUTCMonth() + 1, expYear: later.getUTCFullYear() } }),
      ],
      NOW,
    );
    expect(result.expiring.map((c) => c.subscriptionId)).toEqual(["s1"]);
    expect(result.expiring[0].daysUntilExpiry).toBeLessThanOrEqual(EXPIRY_WINDOW_DAYS);
  });

  it("normalises yearly and quantity-based plans into monthly revenue", () => {
    const result = classify([sub({ items: [{ priceId: "p", unitAmountCents: 120_000, interval: "year", intervalCount: 1, quantity: 2, nickname: null, productName: null }] })], NOW);
    expect(result.activeMrrCents).toBe(20_000);
  });

  it("ranks a long-tenured high-value customer above a new cheap one", () => {
    const invoice = { id: "in", status: "open" as const, currency: "usd", hostedInvoiceUrl: null, attemptCount: 1, nextPaymentAttempt: null, created: NOW - DAY, declineCode: null };
    const result = classify(
      [
        sub({ id: "big", status: "past_due", customer: { id: "c1", email: "a@b.com", name: "Big", created: NOW - 900 * DAY }, items: [{ priceId: "p", unitAmountCents: 19_900, interval: "month", intervalCount: 1, quantity: 1, nickname: null, productName: null }], latestInvoice: { ...invoice, amountDueCents: 19_900 } }),
        sub({ id: "small", status: "past_due", customer: { id: "c2", email: "c@d.com", name: "Small", created: NOW - 20 * DAY }, items: [{ priceId: "p", unitAmountCents: 900, interval: "month", intervalCount: 1, quantity: 1, nickname: null, productName: null }], latestInvoice: { ...invoice, amountDueCents: 900 } }),
      ],
      NOW,
    );
    expect(result.atRisk[0].subscriptionId).toBe("big");
    expect(result.atRisk[0].priority).toBeGreaterThan(result.atRisk[1].priority);
  });

  it("never counts an active subscription as revenue at risk", () => {
    const result = classify([sub(), sub({ id: "s2", status: "trialing" })], NOW);
    expect(result.totals.recoverableCents).toBe(0);
    expect(result.activeSubscriptions).toBe(2);
  });
});

describe("fixture account", () => {
  it("produces every bucket so the demo is never empty", async () => {
    const result = await scan(new FixtureStripe(NOW), NOW);
    expect(result.atRisk.length).toBeGreaterThan(0);
    expect(result.lost.length).toBeGreaterThan(0);
    expect(result.expiring.length).toBeGreaterThan(0);
    expect(result.totals.recoverableCents).toBeGreaterThan(0);
  });

  it("excludes voluntary cancellations from the lost bucket", async () => {
    const result = await scan(new FixtureStripe(NOW), NOW);
    expect(result.lost.some((c) => c.subscriptionId.startsWith("sub_vol"))).toBe(false);
  });

  it("gives every at-risk and lost customer an email address to chase", () => {
    for (const s of buildFixtureSubscriptions(NOW)) {
      expect(s.customer.email).toBeTruthy();
    }
  });
});
