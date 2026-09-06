import type { Interval } from "../money";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface SourceCard {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface SourceInvoice {
  id: string;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  amountDueCents: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  attemptCount: number;
  nextPaymentAttempt: number | null;
  created: number;
  declineCode: string | null;
}

export interface SourceSubscription {
  id: string;
  status: SubscriptionStatus;
  customer: { id: string; email: string | null; name: string | null; created: number };
  items: { priceId: string; unitAmountCents: number; interval: Interval; intervalCount: number; quantity: number; nickname: string | null; productName: string | null }[];
  currency: string;
  created: number;
  canceledAt: number | null;
  cancellationReason: string | null;
  latestInvoice: SourceInvoice | null;
  defaultCard: SourceCard | null;
}

export interface SourceAccount {
  accountId: string;
  businessName: string;
  livemode: boolean;
  /** Which restricted-key permissions were confirmed working. */
  permissions: { subscriptions: boolean; invoices: boolean; customers: boolean; checkout: boolean };
}

export interface StripeSource {
  verify(): Promise<SourceAccount>;
  /** All subscriptions relevant to recovery: active/trialing/past_due/unpaid, plus canceled within `sinceUnix`. */
  listSubscriptions(sinceUnix: number): Promise<SourceSubscription[]>;
  getSubscription(id: string): Promise<SourceSubscription | null>;
  getInvoice(id: string): Promise<SourceInvoice | null>;
  /** Hosted Checkout that re-subscribes the customer to the same prices. Null if the key lacks permission. */
  createReactivationUrl(customerId: string, priceIds: string[], successUrl: string): Promise<string | null>;
  /** Hosted page for the customer to save a new default card. Null if the key lacks permission. */
  createCardUpdateUrl(customerId: string, successUrl: string): Promise<string | null>;
}
