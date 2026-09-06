import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  plan: text("plan").notNull().default("free"), // free | standard | pro
  planStatus: text("plan_status").notNull().default("none"), // none | active | past_due | canceled
  billingCustomerId: text("billing_customer_id"),
  billingSubscriptionId: text("billing_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const loginCodes = pgTable(
  "login_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_codes_email_idx").on(t.email)],
);

export const connections = pgTable(
  "connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    stripeAccountId: text("stripe_account_id").notNull(),
    businessName: text("business_name").notNull(),
    livemode: boolean("livemode").notNull().default(false),
    keyCiphertext: text("key_ciphertext").notNull(),
    keyLast4: text("key_last4").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    permissions: jsonb("permissions").$type<Record<string, boolean>>().notNull().default({}),
    // Founder-voice settings
    productName: text("product_name").notNull(),
    founderName: text("founder_name").notNull().default(""),
    replyTo: text("reply_to").notNull().default(""),
    tone: text("tone").notNull().default("friendly"),
    autoSend: boolean("auto_send").notNull().default(false),
    sequences: jsonb("sequences").$type<unknown>(),
    sequencesSource: text("sequences_source").notNull().default("templates"), // templates | anthropic | custom
    lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
    lastScan: jsonb("last_scan").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("connections_user_idx").on(t.userId)],
);

export const recoveries = pgTable(
  "recoveries",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull(), // at_risk | lost | expiring
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    stripeInvoiceId: text("stripe_invoice_id"),
    customerEmail: text("customer_email"),
    customerName: text("customer_name"),
    planName: text("plan_name").notNull(),
    priceIds: jsonb("price_ids").$type<string[]>().notNull().default([]),
    currency: text("currency").notNull().default("usd"),
    amountCents: integer("amount_cents").notNull(),
    mrrCents: integer("mrr_cents").notNull(),
    ltvCents: integer("ltv_cents").notNull().default(0),
    priority: integer("priority").notNull().default(0),
    declineCode: text("decline_code"),
    snapshot: jsonb("snapshot").$type<unknown>(),
    payUrl: text("pay_url"),
    status: text("status").notNull().default("draft"), // draft | active | paused | recovered | exhausted | closed
    stepIndex: integer("step_index").notNull().default(0),
    startAt: timestamp("start_at", { withTimezone: true }),
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    recoveredAt: timestamp("recovered_at", { withTimezone: true }),
    recoveredCents: integer("recovered_cents"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("recoveries_unique_case").on(t.connectionId, t.stripeSubscriptionId, t.bucket),
    index("recoveries_status_idx").on(t.status, t.nextSendAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    recoveryId: text("recovery_id").notNull().references(() => recoveries.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    toEmail: text("to_email").notNull(),
    fromEmail: text("from_email").notNull(),
    replyTo: text("reply_to"),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    status: text("status").notNull(), // sent | failed | outbox
    providerId: text("provider_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_recovery_idx").on(t.recoveryId)],
);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    name: text("name").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_name_idx").on(t.name, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type Recovery = typeof recoveries.$inferSelect;
export type Message = typeof messages.$inferSelect;
