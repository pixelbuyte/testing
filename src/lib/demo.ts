import { FixtureStripe } from "./stripe/fixture";
import { scan, type AtRiskCustomer, type ScanResult } from "./recovery/scan";
import { declineHint, firstNameOf, render, STEP_SCHEDULE, type SequenceSet, type TemplateVars } from "./recovery/sequence";
import { defaultSequences, type Tone } from "./recovery/templates";
import { formatMoney } from "./money";

export const DEMO_PRODUCT = "Acme Analytics";
export const DEMO_FOUNDER = "Sam";

export interface EmailPreview {
  label: string;
  dayOffset: number;
  subject: string;
  body: string;
}

export function previewVars(c: AtRiskCustomer, product = DEMO_PRODUCT, founder = DEMO_FOUNDER): TemplateVars {
  const expiry = c.cardExpMonth && c.cardExpYear ? new Date(Date.UTC(c.cardExpYear, c.cardExpMonth - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "soon";
  return {
    first_name: firstNameOf(c.name, c.email),
    name: c.name ?? "there",
    product,
    founder,
    plan: c.planName,
    amount: formatMoney(c.amountCents, c.currency),
    mrr: formatMoney(c.mrrCents, c.currency),
    pay_url: "https://invoice.stripe.com/i/…",
    days_late: String(c.daysOverdue),
    decline_hint: declineHint(c.declineCode),
    card_last4: c.cardLast4 ?? "••••",
    expiry,
    days_until_expiry: String(c.daysUntilExpiry ?? 0),
    attempts: String(c.attemptCount),
  };
}

export function previewSequence(c: AtRiskCustomer, sequences: SequenceSet, product?: string, founder?: string): EmailPreview[] {
  const vars = previewVars(c, product, founder);
  return sequences[c.bucket].map((step, i) => ({
    label: step.label,
    dayOffset: STEP_SCHEDULE[c.bucket][i],
    subject: render(step.subject, vars),
    body: render(step.body, vars),
  }));
}

export interface DemoPayload {
  scan: ScanResult;
  previews: Record<string, EmailPreview[]>;
  product: string;
  founder: string;
}

/** The 60-second magic moment, with no account and no Stripe key. */
export function buildDemo(tone: Tone = "friendly", now = Math.floor(Date.now() / 1000)): Promise<DemoPayload> {
  const sequences = defaultSequences(tone);
  return scan(new FixtureStripe(now), now).then((result) => {
    const previews: Record<string, EmailPreview[]> = {};
    for (const c of [...result.atRisk, ...result.lost, ...result.expiring]) {
      previews[c.subscriptionId] = previewSequence(c, sequences, DEMO_PRODUCT, DEMO_FOUNDER);
    }
    return { scan: result, previews, product: DEMO_PRODUCT, founder: DEMO_FOUNDER };
  });
}
