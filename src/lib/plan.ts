export type PlanId = "free" | "standard" | "pro";

export interface PlanLimits {
  id: PlanId;
  name: string;
  priceMonthly: number;
  /** How many recovery sequences can be running at once. */
  activeSequences: number;
  connections: number;
  autoSend: boolean;
  customSendingDomain: boolean;
  blurb: string;
  features: string[];
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    activeSequences: 3,
    connections: 1,
    autoSend: false,
    customSendingDomain: false,
    blurb: "See exactly what you're losing, and win back three customers a month.",
    features: [
      "Unlimited scans of your Stripe account",
      "Full at-risk, already-lost and expiring-card breakdown",
      "3 recovery sequences running at a time",
      "You approve every email before it sends",
    ],
  },
  standard: {
    id: "standard",
    name: "Standard",
    priceMonthly: 15,
    activeSequences: Number.POSITIVE_INFINITY,
    connections: 1,
    autoSend: true,
    customSendingDomain: false,
    blurb: "Every failed payment gets chased, automatically.",
    features: [
      "Unlimited recovery sequences",
      "Auto-send: new failures start chasing within the hour",
      "Founder-voice emails drafted for your product",
      "Pre-expiry nudges before a card ever fails",
      "Recovered-revenue reporting",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 25,
    activeSequences: Number.POSITIVE_INFINITY,
    connections: 5,
    autoSend: true,
    customSendingDomain: true,
    blurb: "For founders running more than one product.",
    features: [
      "Everything in Standard",
      "Up to 5 Stripe accounts",
      "Send from your own verified domain",
      "Per-product sequences and reporting",
    ],
  },
};

export const planOf = (id: string): PlanLimits => PLANS[(id as PlanId) in PLANS ? (id as PlanId) : "free"];

export function canStartSequence(planId: string, activeCount: number) {
  const plan = planOf(planId);
  if (activeCount < plan.activeSequences) return { ok: true as const };
  return {
    ok: false as const,
    reason: `The free plan runs ${plan.activeSequences} sequences at a time. Upgrade to chase every failed payment.`,
  };
}
