import { FixtureStripe, isDemoKey } from "./fixture";
import { LiveStripe } from "./live";
import type { StripeSource } from "./types";

export { StripePermissionError } from "./live";
export { FixtureStripe, isDemoKey } from "./fixture";
export type { SourceSubscription, StripeSource, SourceAccount } from "./types";

export function sourceFor(secretKey: string): StripeSource {
  return isDemoKey(secretKey) ? new FixtureStripe() : new LiveStripe(secretKey);
}

const KEY_RE = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/;

export function validateKeyShape(key: string): { ok: true } | { ok: false; reason: string } {
  const k = key.trim();
  if (isDemoKey(k)) return { ok: true };
  if (k.startsWith("pk_")) return { ok: false, reason: "That's a publishable key. PastDue needs a restricted key (starts with rk_)." };
  if (k.startsWith("sk_")) return { ok: true };
  if (!KEY_RE.test(k)) return { ok: false, reason: "That doesn't look like a Stripe key. It should start with rk_test_ or rk_live_." };
  return { ok: true };
}

export const keyLast4 = (key: string) => key.trim().slice(-4);
