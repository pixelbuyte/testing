import { normalizeToMonthlyCents } from "../money";
import type { SourceSubscription, StripeSource } from "../stripe/types";

export type Bucket = "at_risk" | "lost" | "expiring";

export interface AtRiskCustomer {
  bucket: Bucket;
  subscriptionId: string;
  customerId: string;
  invoiceId: string | null;
  email: string | null;
  name: string | null;
  planName: string;
  priceIds: string[];
  currency: string;
  /** Invoice amount due (at_risk) or MRR (lost/expiring). */
  amountCents: number;
  mrrCents: number;
  customerSince: number;
  tenureDays: number;
  /** Lifetime value estimate: MRR × months as a customer. */
  ltvCents: number;
  declineCode: string | null;
  attemptCount: number;
  daysOverdue: number;
  nextRetryAt: number | null;
  stripeGaveUp: boolean;
  canceledAt: number | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  daysUntilExpiry: number | null;
  hostedInvoiceUrl: string | null;
  /** 0–100; drives ordering and the "call this one" flag. */
  priority: number;
}

export interface ScanResult {
  scannedAt: number;
  activeSubscriptions: number;
  activeMrrCents: number;
  currency: string;
  atRisk: AtRiskCustomer[];
  lost: AtRiskCustomer[];
  expiring: AtRiskCustomer[];
  totals: {
    atRiskCents: number;
    atRiskMrrCents: number;
    lostMrrCents: number;
    lostAnnualCents: number;
    expiringMrrCents: number;
    recoverableCents: number;
  };
}

export const LOST_WINDOW_DAYS = 90;
export const EXPIRY_WINDOW_DAYS = 30;

const DAY = 86_400;

function mrrOf(sub: SourceSubscription) {
  return sub.items.reduce((sum, it) => sum + normalizeToMonthlyCents(it.unitAmountCents, it.interval, it.intervalCount, it.quantity), 0);
}

function planNameOf(sub: SourceSubscription) {
  const names = sub.items.map((it) => it.nickname ?? it.productName).filter(Boolean) as string[];
  return names.length ? Array.from(new Set(names)).join(" + ") : "Subscription";
}

function daysUntilCardExpiry(now: number, expMonth: number, expYear: number) {
  // Cards are valid through the last day of the expiry month.
  const end = Date.UTC(expYear, expMonth, 0, 23, 59, 59) / 1000;
  return Math.floor((end - now) / DAY);
}

function priorityFor(c: Omit<AtRiskCustomer, "priority">) {
  const money = Math.min(60, Math.round((c.mrrCents / 20_000) * 60));
  const tenure = Math.min(25, Math.round((c.tenureDays / 730) * 25));
  const urgency = c.bucket === "at_risk" ? Math.min(15, c.daysOverdue) : c.bucket === "expiring" ? Math.max(0, 15 - (c.daysUntilExpiry ?? 30) / 2) : 10;
  return Math.max(1, Math.min(100, Math.round(money + tenure + urgency)));
}

function base(sub: SourceSubscription, now: number, bucket: Bucket) {
  const mrr = mrrOf(sub);
  const tenureDays = Math.max(0, Math.floor((now - sub.customer.created) / DAY));
  const ltv = Math.round(mrr * Math.max(1, tenureDays / 30.4));
  return {
    bucket,
    subscriptionId: sub.id,
    customerId: sub.customer.id,
    invoiceId: sub.latestInvoice?.id ?? null,
    email: sub.customer.email,
    name: sub.customer.name,
    planName: planNameOf(sub),
    priceIds: sub.items.map((it) => it.priceId),
    currency: sub.currency,
    mrrCents: mrr,
    customerSince: sub.customer.created,
    tenureDays,
    ltvCents: ltv,
    declineCode: sub.latestInvoice?.declineCode ?? null,
    attemptCount: sub.latestInvoice?.attemptCount ?? 0,
    cardLast4: sub.defaultCard?.last4 ?? null,
    cardExpMonth: sub.defaultCard?.expMonth ?? null,
    cardExpYear: sub.defaultCard?.expYear ?? null,
    hostedInvoiceUrl: sub.latestInvoice?.hostedInvoiceUrl ?? null,
    canceledAt: sub.canceledAt,
  };
}

export function classify(subs: SourceSubscription[], now = Math.floor(Date.now() / 1000)): ScanResult {
  const atRisk: AtRiskCustomer[] = [];
  const lost: AtRiskCustomer[] = [];
  const expiring: AtRiskCustomer[] = [];
  let activeSubscriptions = 0;
  let activeMrrCents = 0;
  const currencies = new Map<string, number>();

  for (const sub of subs) {
    currencies.set(sub.currency, (currencies.get(sub.currency) ?? 0) + 1);

    if (sub.status === "past_due" || sub.status === "unpaid") {
      const inv = sub.latestInvoice;
      const daysOverdue = inv ? Math.max(0, Math.floor((now - inv.created) / DAY)) : 0;
      const partial = {
        ...base(sub, now, "at_risk"),
        amountCents: inv?.amountDueCents ?? mrrOf(sub),
        daysOverdue,
        nextRetryAt: inv?.nextPaymentAttempt ?? null,
        stripeGaveUp: sub.status === "unpaid" || (inv?.nextPaymentAttempt == null && (inv?.attemptCount ?? 0) > 0),
        daysUntilExpiry: null,
      };
      atRisk.push({ ...partial, priority: priorityFor(partial) });
      continue;
    }

    if (sub.status === "canceled") {
      if (sub.cancellationReason === "payment_failed" && sub.canceledAt && sub.canceledAt >= now - LOST_WINDOW_DAYS * DAY) {
        const partial = {
          ...base(sub, now, "lost"),
          amountCents: mrrOf(sub),
          daysOverdue: Math.floor((now - sub.canceledAt) / DAY),
          nextRetryAt: null,
          stripeGaveUp: true,
          daysUntilExpiry: null,
        };
        lost.push({ ...partial, priority: priorityFor(partial) });
      }
      continue;
    }

    if (sub.status === "active" || sub.status === "trialing") {
      activeSubscriptions += 1;
      activeMrrCents += mrrOf(sub);
      const card = sub.defaultCard;
      if (card) {
        const days = daysUntilCardExpiry(now, card.expMonth, card.expYear);
        if (days <= EXPIRY_WINDOW_DAYS) {
          const partial = {
            ...base(sub, now, "expiring"),
            amountCents: mrrOf(sub),
            daysOverdue: 0,
            nextRetryAt: null,
            stripeGaveUp: false,
            daysUntilExpiry: days,
          };
          expiring.push({ ...partial, priority: priorityFor(partial) });
        }
      }
    }
  }

  const byPriority = (a: AtRiskCustomer, b: AtRiskCustomer) => b.priority - a.priority;
  atRisk.sort(byPriority);
  lost.sort(byPriority);
  expiring.sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0));

  const atRiskCents = atRisk.reduce((s, c) => s + c.amountCents, 0);
  const atRiskMrrCents = atRisk.reduce((s, c) => s + c.mrrCents, 0);
  const lostMrrCents = lost.reduce((s, c) => s + c.mrrCents, 0);
  const expiringMrrCents = expiring.reduce((s, c) => s + c.mrrCents, 0);
  const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "usd";

  return {
    scannedAt: now,
    activeSubscriptions,
    activeMrrCents,
    currency,
    atRisk,
    lost,
    expiring,
    totals: {
      atRiskCents,
      atRiskMrrCents,
      lostMrrCents,
      lostAnnualCents: lostMrrCents * 12,
      expiringMrrCents,
      recoverableCents: atRiskCents + lostMrrCents * 12,
    },
  };
}

export async function scan(source: StripeSource, now = Math.floor(Date.now() / 1000)): Promise<ScanResult> {
  const subs = await source.listSubscriptions(now - LOST_WINDOW_DAYS * DAY);
  return classify(subs, now);
}
