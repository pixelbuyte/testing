import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Connection, Recovery } from "./db/schema";
import { decrypt, randomId } from "./crypto";
import { env } from "./env";
import { fromHeader, sendEmail } from "./email";
import { formatMoney } from "./money";
import { track } from "./analytics";
import { scan, type AtRiskCustomer, type Bucket, type ScanResult } from "./recovery/scan";
import { declineHint, firstNameOf, isExhausted, render, sequenceStartAt, stepSendAt, type SequenceSet, type TemplateVars } from "./recovery/sequence";
import { defaultSequences, type Tone } from "./recovery/templates";
import { sourceFor } from "./stripe";
import type { StripeSource } from "./stripe/types";

export const sourceForConnection = async (connection: Connection): Promise<StripeSource> => sourceFor(await decrypt(connection.keyCiphertext));

export function sequencesOf(connection: Connection): SequenceSet {
  const stored = connection.sequences as SequenceSet | null;
  if (stored && stored.at_risk && stored.lost && stored.expiring) return stored;
  return defaultSequences((connection.tone as Tone) ?? "friendly");
}

export function varsFor(connection: Connection, c: AtRiskCustomer, payUrl: string): TemplateVars {
  const expiry = c.cardExpMonth && c.cardExpYear ? new Date(Date.UTC(c.cardExpYear, c.cardExpMonth - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "soon";
  return {
    first_name: firstNameOf(c.name, c.email),
    name: c.name ?? firstNameOf(c.name, c.email),
    product: connection.productName,
    founder: connection.founderName || "the team",
    plan: c.planName,
    amount: formatMoney(c.amountCents, c.currency),
    mrr: formatMoney(c.mrrCents, c.currency),
    pay_url: payUrl,
    days_late: String(c.daysOverdue),
    decline_hint: declineHint(c.declineCode),
    card_last4: c.cardLast4 ?? "••••",
    expiry,
    days_until_expiry: String(c.daysUntilExpiry ?? 0),
    attempts: String(c.attemptCount),
  };
}

export function renderStep(connection: Connection, recovery: Recovery, stepIndex: number) {
  const sequences = sequencesOf(connection);
  const steps = sequences[recovery.bucket as Bucket];
  const step = steps[stepIndex];
  if (!step) return null;
  const snapshot = recovery.snapshot as AtRiskCustomer;
  const vars = varsFor(connection, snapshot, recovery.payUrl ?? "");
  return { label: step.label, subject: render(step.subject, vars), body: render(step.body, vars) };
}

async function payUrlFor(source: StripeSource, c: AtRiskCustomer): Promise<string | null> {
  const back = `${env.appUrl}/thanks`;
  if (c.bucket === "at_risk" && c.hostedInvoiceUrl) return c.hostedInvoiceUrl;
  if (c.bucket === "lost") return source.createReactivationUrl(c.customerId, c.priceIds, back);
  return source.createCardUpdateUrl(c.customerId, back);
}

/** Runs a scan and reconciles it with the stored recovery rows. */
export async function syncConnection(connection: Connection, now = Math.floor(Date.now() / 1000)) {
  const db = await getDb();
  const source = await sourceForConnection(connection);
  const result = await scan(source, now);

  await db
    .update(schema.connections)
    .set({ lastScanAt: new Date(now * 1000), lastScan: result })
    .where(eq(schema.connections.id, connection.id));

  const all = [...result.atRisk, ...result.lost, ...result.expiring];
  const existing = await db.select().from(schema.recoveries).where(eq(schema.recoveries.connectionId, connection.id));
  const byKey = new Map(existing.map((r) => [`${r.stripeSubscriptionId}:${r.bucket}`, r]));

  for (const c of all) {
    const key = `${c.subscriptionId}:${c.bucket}`;
    const prior = byKey.get(key);
    if (prior) {
      if (prior.status === "recovered" || prior.status === "closed") continue;
      await db
        .update(schema.recoveries)
        .set({
          amountCents: c.amountCents,
          mrrCents: c.mrrCents,
          ltvCents: c.ltvCents,
          priority: c.priority,
          declineCode: c.declineCode,
          snapshot: c,
          stripeInvoiceId: c.invoiceId,
          customerEmail: c.email,
          lastCheckedAt: new Date(now * 1000),
          updatedAt: new Date(),
        })
        .where(eq(schema.recoveries.id, prior.id));
      continue;
    }
    await db.insert(schema.recoveries).values({
      id: randomId("rec"),
      connectionId: connection.id,
      bucket: c.bucket,
      stripeCustomerId: c.customerId,
      stripeSubscriptionId: c.subscriptionId,
      stripeInvoiceId: c.invoiceId,
      customerEmail: c.email,
      customerName: c.name,
      planName: c.planName,
      priceIds: c.priceIds,
      currency: c.currency,
      amountCents: c.amountCents,
      mrrCents: c.mrrCents,
      ltvCents: c.ltvCents,
      priority: c.priority,
      declineCode: c.declineCode,
      snapshot: c,
      status: "draft",
      lastCheckedAt: new Date(now * 1000),
    });
  }

  // Anything no longer in a problem bucket has been fixed.
  const stillProblem = new Set(all.map((c) => `${c.subscriptionId}:${c.bucket}`));
  const resolved = existing.filter((r) => !stillProblem.has(`${r.stripeSubscriptionId}:${r.bucket}`) && r.status !== "recovered" && r.status !== "closed");
  for (const r of resolved) {
    await markRecovered(r, now);
  }

  return result;
}

async function markRecovered(recovery: Recovery, now: number) {
  const db = await getDb();
  const touched = recovery.status === "active" || recovery.status === "exhausted";
  await db
    .update(schema.recoveries)
    .set({
      status: touched ? "recovered" : "closed",
      recoveredAt: new Date(now * 1000),
      recoveredCents: touched ? recovery.amountCents : 0,
      nextSendAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.recoveries.id, recovery.id));
  if (touched) {
    await track("recovery_detected", { recoveryId: recovery.id, bucket: recovery.bucket, cents: recovery.amountCents });
  }
}

export async function startSequence(connection: Connection, recovery: Recovery, now = Math.floor(Date.now() / 1000)) {
  const db = await getDb();
  const source = await sourceForConnection(connection);
  const snapshot = recovery.snapshot as AtRiskCustomer;
  const payUrl = recovery.payUrl ?? (await payUrlFor(source, snapshot));
  const startAt = sequenceStartAt(recovery.bucket as Bucket, now, snapshot.daysUntilExpiry);
  const nextSendAt = stepSendAt(startAt, recovery.bucket as Bucket, 0);

  const [updated] = await db
    .update(schema.recoveries)
    .set({
      status: "active",
      stepIndex: 0,
      payUrl,
      startAt: new Date(startAt * 1000),
      nextSendAt: nextSendAt ? new Date(nextSendAt * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.recoveries.id, recovery.id))
    .returning();

  await track("sequence_started", { recoveryId: recovery.id, bucket: recovery.bucket, cents: recovery.amountCents });
  return updated;
}

export async function pauseSequence(recoveryId: string) {
  const db = await getDb();
  const [updated] = await db
    .update(schema.recoveries)
    .set({ status: "paused", nextSendAt: null, updatedAt: new Date() })
    .where(eq(schema.recoveries.id, recoveryId))
    .returning();
  await track("sequence_paused", { recoveryId });
  return updated;
}

/** True when the customer has paid / reactivated since the snapshot was taken. */
async function stillNeedsChasing(source: StripeSource, recovery: Recovery): Promise<boolean> {
  const sub = await source.getSubscription(recovery.stripeSubscriptionId);
  if (!sub) return true; // Can't confirm; don't silently stop chasing.
  if (recovery.bucket === "at_risk") return sub.status === "past_due" || sub.status === "unpaid";
  if (recovery.bucket === "lost") return sub.status === "canceled";
  return sub.status === "active" || sub.status === "trialing";
}

export interface SendReport {
  considered: number;
  sent: number;
  skippedRecovered: number;
  failed: number;
  exhausted: number;
}

/** The loop the cron calls: send every step that is due, stopping anything already paid. */
export async function runDueSends(now = Math.floor(Date.now() / 1000)): Promise<SendReport> {
  const db = await getDb();
  const due = await db
    .select()
    .from(schema.recoveries)
    .where(and(eq(schema.recoveries.status, "active"), isNotNull(schema.recoveries.nextSendAt), lte(schema.recoveries.nextSendAt, new Date(now * 1000))));

  const report: SendReport = { considered: due.length, sent: 0, skippedRecovered: 0, failed: 0, exhausted: 0 };
  if (due.length === 0) return report;

  const connectionIds = [...new Set(due.map((r) => r.connectionId))];
  const connections = await db.select().from(schema.connections).where(inArray(schema.connections.id, connectionIds));
  const byId = new Map(connections.map((c) => [c.id, c]));

  for (const recovery of due) {
    const connection = byId.get(recovery.connectionId);
    if (!connection) continue;
    const source = await sourceForConnection(connection);

    if (!(await stillNeedsChasing(source, recovery))) {
      await markRecovered(recovery, now);
      report.skippedRecovered += 1;
      continue;
    }

    const rendered = renderStep(connection, recovery, recovery.stepIndex);
    if (!rendered || !recovery.customerEmail) {
      await db.update(schema.recoveries).set({ status: "exhausted", nextSendAt: null, updatedAt: new Date() }).where(eq(schema.recoveries.id, recovery.id));
      report.exhausted += 1;
      continue;
    }

    const from = fromHeader(connection.founderName, connection.productName);
    const result = await sendEmail({
      to: recovery.customerEmail,
      from,
      replyTo: connection.replyTo || undefined,
      subject: rendered.subject,
      text: rendered.body,
    });

    await db.insert(schema.messages).values({
      id: randomId("msg"),
      recoveryId: recovery.id,
      stepIndex: recovery.stepIndex,
      toEmail: recovery.customerEmail,
      fromEmail: from,
      replyTo: connection.replyTo || null,
      subject: rendered.subject,
      bodyText: rendered.body,
      status: result.status,
      providerId: result.providerId ?? null,
      error: result.error ?? null,
    });

    if (result.status === "failed") {
      report.failed += 1;
      await db
        .update(schema.recoveries)
        .set({ nextSendAt: new Date((now + 3600) * 1000), updatedAt: new Date() })
        .where(eq(schema.recoveries.id, recovery.id));
      continue;
    }

    report.sent += 1;
    await track("email_sent", { recoveryId: recovery.id, stepIndex: recovery.stepIndex, bucket: recovery.bucket });

    const nextIndex = recovery.stepIndex + 1;
    const startAt = Math.floor((recovery.startAt?.getTime() ?? now * 1000) / 1000);
    const nextAt = stepSendAt(startAt, recovery.bucket as Bucket, nextIndex);
    const done = isExhausted(recovery.bucket as Bucket, nextIndex);
    if (done) report.exhausted += 1;

    await db
      .update(schema.recoveries)
      .set({
        stepIndex: nextIndex,
        status: done ? "exhausted" : "active",
        nextSendAt: done || !nextAt ? null : new Date(nextAt * 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.recoveries.id, recovery.id));
  }

  return report;
}

export interface DashboardData {
  connection: Connection;
  scan: ScanResult | null;
  recoveries: Recovery[];
  recovered: { count: number; cents: number };
  activeCount: number;
}

export async function loadDashboard(connection: Connection): Promise<DashboardData> {
  const db = await getDb();
  const recoveries = await db
    .select()
    .from(schema.recoveries)
    .where(eq(schema.recoveries.connectionId, connection.id))
    .orderBy(desc(schema.recoveries.priority));
  const recoveredRows = recoveries.filter((r) => r.status === "recovered");
  return {
    connection,
    scan: (connection.lastScan as ScanResult | null) ?? null,
    recoveries,
    recovered: { count: recoveredRows.length, cents: recoveredRows.reduce((s, r) => s + (r.recoveredCents ?? 0), 0) },
    activeCount: recoveries.filter((r) => r.status === "active").length,
  };
}
