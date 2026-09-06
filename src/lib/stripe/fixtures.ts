import type { SourceSubscription } from "./types";

const DAY = 86_400;

type Seed = {
  id: string;
  status: SourceSubscription["status"];
  name: string;
  email: string;
  plan: "Starter" | "Growth" | "Team";
  interval?: "month" | "year";
  qty?: number;
  customerAgeDays: number;
  invoiceAgeDays?: number;
  attempts?: number;
  decline?: string;
  canceledDaysAgo?: number;
  cancelReason?: string | null;
  card?: { brand: string; last4: string; expInDays: number };
};

const PRICES = {
  Starter: { month: 2900, year: 29_000, priceId: "price_starter" },
  Growth: { month: 7900, year: 79_000, priceId: "price_growth" },
  Team: { month: 19_900, year: 199_000, priceId: "price_team" },
};

const seeds: Seed[] = [
  // Retry window still open (past_due)
  { id: "sub_pd_01", status: "past_due", name: "Priya Raman", email: "priya@northwindlabs.io", plan: "Growth", customerAgeDays: 412, invoiceAgeDays: 2, attempts: 1, decline: "insufficient_funds", card: { brand: "visa", last4: "4242", expInDays: 400 } },
  { id: "sub_pd_02", status: "past_due", name: "Daniel Okafor", email: "dan@okaforstudio.com", plan: "Starter", customerAgeDays: 88, invoiceAgeDays: 5, attempts: 2, decline: "expired_card", card: { brand: "mastercard", last4: "5100", expInDays: -20 } },
  { id: "sub_pd_03", status: "past_due", name: "Hannah Lindqvist", email: "hannah@lindqvist.se", plan: "Team", customerAgeDays: 730, invoiceAgeDays: 9, attempts: 3, decline: "do_not_honor", card: { brand: "visa", last4: "0341", expInDays: 300 } },
  { id: "sub_pd_04", status: "past_due", name: "Marcus Bell", email: "marcus@bellandco.dev", plan: "Growth", interval: "year", customerAgeDays: 365, invoiceAgeDays: 1, attempts: 1, decline: "generic_decline", card: { brand: "amex", last4: "1005", expInDays: 500 } },
  { id: "sub_pd_05", status: "past_due", name: "Sofia Álvarez", email: "sofia@alvarezconsulting.mx", plan: "Starter", customerAgeDays: 34, invoiceAgeDays: 11, attempts: 4, decline: "insufficient_funds", card: { brand: "visa", last4: "9911", expInDays: 200 } },
  { id: "sub_pd_06", status: "unpaid", name: "Tomás Ferreira", email: "tomas@ferreira.pt", plan: "Growth", customerAgeDays: 540, invoiceAgeDays: 19, attempts: 4, decline: "lost_card", card: { brand: "visa", last4: "7710", expInDays: 250 } },
  { id: "sub_pd_07", status: "past_due", name: "Aisha Khan", email: "aisha@khanventures.co", plan: "Team", qty: 2, customerAgeDays: 210, invoiceAgeDays: 4, attempts: 2, decline: "card_velocity_exceeded", card: { brand: "mastercard", last4: "2003", expInDays: 600 } },

  // Already lost: Stripe exhausted retries and canceled
  { id: "sub_lost_01", status: "canceled", name: "Ben Whitaker", email: "ben@whitaker.digital", plan: "Growth", customerAgeDays: 600, canceledDaysAgo: 6, cancelReason: "payment_failed", decline: "expired_card" },
  { id: "sub_lost_02", status: "canceled", name: "Chloé Martin", email: "chloe@martin-agence.fr", plan: "Starter", customerAgeDays: 150, canceledDaysAgo: 14, cancelReason: "payment_failed", decline: "insufficient_funds" },
  { id: "sub_lost_03", status: "canceled", name: "Ravi Desai", email: "ravi@desaiapps.in", plan: "Team", customerAgeDays: 900, canceledDaysAgo: 22, cancelReason: "payment_failed", decline: "do_not_honor" },
  { id: "sub_lost_04", status: "canceled", name: "Emily Chen", email: "emily@chenandpartners.com", plan: "Growth", customerAgeDays: 300, canceledDaysAgo: 41, cancelReason: "payment_failed", decline: "expired_card" },
  { id: "sub_lost_05", status: "canceled", name: "Lukas Weber", email: "lukas@weberhaus.de", plan: "Starter", customerAgeDays: 45, canceledDaysAgo: 58, cancelReason: "payment_failed", decline: "generic_decline" },
  { id: "sub_lost_06", status: "canceled", name: "Grace Oyelaran", email: "grace@oyelaran.ng", plan: "Growth", customerAgeDays: 480, canceledDaysAgo: 77, cancelReason: "payment_failed", decline: "insufficient_funds" },
  // Voluntary cancellations must NOT be counted
  { id: "sub_vol_01", status: "canceled", name: "Noah Fischer", email: "noah@fischer.io", plan: "Starter", customerAgeDays: 120, canceledDaysAgo: 10, cancelReason: "cancellation_requested" },
  { id: "sub_vol_02", status: "canceled", name: "Olivia Park", email: "olivia@parkstudio.kr", plan: "Growth", customerAgeDays: 400, canceledDaysAgo: 30, cancelReason: "cancellation_requested" },

  // Healthy, but the card expires soon
  { id: "sub_exp_01", status: "active", name: "Jonas Berg", email: "jonas@bergsoftware.no", plan: "Team", customerAgeDays: 800, card: { brand: "visa", last4: "3311", expInDays: 9 } },
  { id: "sub_exp_02", status: "active", name: "Maya Patel", email: "maya@patelcreative.com", plan: "Growth", customerAgeDays: 260, card: { brand: "mastercard", last4: "8080", expInDays: 18 } },
  { id: "sub_exp_03", status: "active", name: "Ethan Ross", email: "ethan@rossanalytics.com", plan: "Starter", customerAgeDays: 95, card: { brand: "visa", last4: "1212", expInDays: 27 } },

  // Healthy and boring
  { id: "sub_ok_01", status: "active", name: "Isabella Rossi", email: "isabella@rossi.it", plan: "Growth", customerAgeDays: 500, card: { brand: "visa", last4: "5555", expInDays: 700 } },
  { id: "sub_ok_02", status: "active", name: "Liam Murphy", email: "liam@murphy.ie", plan: "Starter", customerAgeDays: 60, card: { brand: "amex", last4: "0009", expInDays: 900 } },
  { id: "sub_ok_03", status: "trialing", name: "Zoe Nakamura", email: "zoe@nakamura.jp", plan: "Team", customerAgeDays: 5, card: { brand: "visa", last4: "1881", expInDays: 800 } },
];

function expToMonthYear(now: number, expInDays: number) {
  const d = new Date((now + expInDays * DAY) * 1000);
  return { expMonth: d.getUTCMonth() + 1, expYear: d.getUTCFullYear() };
}

export function buildFixtureSubscriptions(now = Math.floor(Date.now() / 1000)): SourceSubscription[] {
  return seeds.map((s) => {
    const interval = s.interval ?? "month";
    const price = PRICES[s.plan];
    const unit = interval === "year" ? price.year : price.month;
    const qty = s.qty ?? 1;
    const customerCreated = now - s.customerAgeDays * DAY;
    const isDelinquent = s.status === "past_due" || s.status === "unpaid";
    const invoiceCreated = now - (s.invoiceAgeDays ?? 0) * DAY;
    const invoice = isDelinquent
      ? {
          id: `in_${s.id}`,
          status: "open" as const,
          amountDueCents: unit * qty,
          currency: "usd",
          hostedInvoiceUrl: `https://invoice.stripe.com/i/acct_demo/${s.id}`,
          attemptCount: s.attempts ?? 1,
          nextPaymentAttempt: s.status === "unpaid" ? null : invoiceCreated + 3 * DAY,
          created: invoiceCreated,
          declineCode: s.decline ?? null,
        }
      : s.status === "canceled" && s.cancelReason === "payment_failed"
        ? {
            id: `in_${s.id}`,
            status: "uncollectible" as const,
            amountDueCents: unit * qty,
            currency: "usd",
            hostedInvoiceUrl: null,
            attemptCount: 4,
            nextPaymentAttempt: null,
            created: now - ((s.canceledDaysAgo ?? 0) + 14) * DAY,
            declineCode: s.decline ?? null,
          }
        : null;
    return {
      id: s.id,
      status: s.status,
      customer: { id: `cus_${s.id}`, email: s.email, name: s.name, created: customerCreated },
      items: [
        { priceId: price.priceId, unitAmountCents: unit, interval, intervalCount: 1, quantity: qty, nickname: s.plan, productName: "Acme Analytics" },
      ],
      currency: "usd",
      created: customerCreated,
      canceledAt: s.canceledDaysAgo != null ? now - s.canceledDaysAgo * DAY : null,
      cancellationReason: s.cancelReason ?? null,
      latestInvoice: invoice,
      defaultCard: s.card ? { brand: s.card.brand, last4: s.card.last4, ...expToMonthYear(now, s.card.expInDays) } : null,
    };
  });
}

export const FIXTURE_ACCOUNT = { accountId: "acct_demo", businessName: "Acme Analytics", livemode: false };
