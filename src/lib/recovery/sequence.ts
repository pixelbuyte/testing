import type { Bucket } from "./scan";

export interface SequenceStep {
  /** Days after the sequence starts. */
  dayOffset: number;
  /** Short label shown in the UI. */
  label: string;
  subject: string;
  body: string;
}

export type SequenceSet = Record<Bucket, SequenceStep[]>;

const DAY = 86_400;

/** Days after sequence start on which each step goes out. */
export const STEP_SCHEDULE: Record<Bucket, number[]> = {
  at_risk: [0, 3, 7, 12],
  lost: [0, 4, 10],
  expiring: [0, 7],
};

/** Card-expiry sequences start this many days before the card stops working. */
export const EXPIRY_LEAD_DAYS = 14;

export function sequenceStartAt(bucket: Bucket, now: number, daysUntilExpiry: number | null) {
  if (bucket !== "expiring" || daysUntilExpiry == null) return now;
  const lead = Math.max(0, daysUntilExpiry - EXPIRY_LEAD_DAYS);
  return now + lead * DAY;
}

export function stepSendAt(startAt: number, bucket: Bucket, stepIndex: number) {
  const offsets = STEP_SCHEDULE[bucket];
  if (stepIndex >= offsets.length) return null;
  return startAt + offsets[stepIndex] * DAY;
}

export function isExhausted(bucket: Bucket, nextStepIndex: number) {
  return nextStepIndex >= STEP_SCHEDULE[bucket].length;
}

export interface TemplateVars {
  first_name: string;
  name: string;
  product: string;
  founder: string;
  plan: string;
  amount: string;
  mrr: string;
  pay_url: string;
  days_late: string;
  decline_hint: string;
  card_last4: string;
  expiry: string;
  days_until_expiry: string;
  attempts: string;
}

export function render(template: string, vars: TemplateVars) {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => {
    const v = (vars as unknown as Record<string, string | undefined>)[key];
    return v == null ? m : v;
  });
}

export function firstNameOf(name: string | null, email: string | null) {
  if (name && name.trim()) return name.trim().split(/\s+/)[0];
  if (email) return email.split("@")[0].replace(/[._-]+/g, " ").split(" ")[0];
  return "there";
}

export const DECLINE_HINTS: Record<string, string> = {
  insufficient_funds: "the bank reported insufficient funds at the time of the charge",
  expired_card: "the card on file has expired",
  lost_card: "the bank reported the card as lost",
  stolen_card: "the bank reported the card as stolen",
  do_not_honor: "the bank declined the charge without giving a reason (usually a fraud filter)",
  generic_decline: "the bank declined the charge without giving a reason",
  card_velocity_exceeded: "the bank's spending limit was hit for the day",
  processing_error: "the card network had a processing error",
  incorrect_cvc: "the security code didn't match",
  card_declined: "the bank declined the charge",
  authentication_required: "the bank asked for extra verification that never completed",
};

export function declineHint(code: string | null) {
  if (!code) return "the payment didn't go through";
  return DECLINE_HINTS[code] ?? `the bank returned "${code.replace(/_/g, " ")}"`;
}
