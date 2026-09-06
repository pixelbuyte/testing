"use client";

import { useState } from "react";
import type { AtRiskCustomer, Bucket } from "@/lib/recovery/scan";
import type { EmailPreview } from "@/lib/demo";
import { formatMoney } from "@/lib/money";
import { Button, Card, Pill } from "./ui";

export interface RecoveryRow {
  key: string;
  customer: AtRiskCustomer;
  previews: EmailPreview[];
  recoveryId?: string;
  status?: string;
  stepIndex?: number;
}

const SECTIONS: { bucket: Bucket; title: string; blurb: string }[] = [
  {
    bucket: "at_risk",
    title: "Failing now",
    blurb: "Stripe is still retrying these. A personal note beats a generic receipt.",
  },
  {
    bucket: "lost",
    title: "Already lost",
    blurb: "Stripe ran out of retries and cancelled these. It stopped emailing them, and nobody has asked them to come back.",
  },
  {
    bucket: "expiring",
    title: "About to fail",
    blurb: "The card on file expires within 30 days. Cheapest possible save.",
  },
];

function statusPill(row: RecoveryRow) {
  if (!row.status || row.status === "draft") return null;
  const map: Record<string, { tone: "good" | "neutral"; text: string }> = {
    active: { tone: "good", text: `Chasing · step ${(row.stepIndex ?? 0) + 1}` },
    paused: { tone: "neutral", text: "Paused" },
    recovered: { tone: "good", text: "Recovered" },
    exhausted: { tone: "neutral", text: "Sequence finished" },
    closed: { tone: "neutral", text: "Resolved" },
  };
  const s = map[row.status];
  return s ? <Pill tone={s.tone}>{s.text}</Pill> : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function inDays(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function subline(c: AtRiskCustomer) {
  if (c.bucket === "at_risk") {
    const retry = c.stripeGaveUp
      ? "Stripe stopped retrying"
      : c.nextRetryAt
        ? `Stripe retries ${inDays(Math.ceil((c.nextRetryAt - Date.now() / 1000) / 86_400))}`
        : "Stripe is still retrying";
    return `${plural(c.daysOverdue, "day")} overdue · ${plural(c.attemptCount, "attempt")} · ${retry}`;
  }
  if (c.bucket === "lost") {
    const months = Math.max(1, Math.round(c.tenureDays / 30.4));
    return `Cancelled ${plural(c.daysOverdue, "day")} ago · was a customer for ${plural(months, "month")}`;
  }
  return `Card ${c.cardLast4} expires ${inDays(c.daysUntilExpiry ?? 0)}`;
}

export function ScanView({
  rows,
  onStart,
  onPause,
  busyKey,
  emptyNote,
}: {
  rows: RecoveryRow[];
  onStart?: (row: RecoveryRow) => void;
  onPause?: (row: RecoveryRow) => void;
  busyKey?: string | null;
  emptyNote?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[15px] font-medium text-ink">Nothing to chase.</p>
        <p className="mx-auto mt-1.5 max-w-md text-[14px] text-ink-3">
          {emptyNote ?? "No failing payments, no cards about to expire, and nobody cancelled by a dead card in the last 90 days."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {SECTIONS.map((section) => {
        const items = rows.filter((r) => r.customer.bucket === section.bucket);
        if (items.length === 0) return null;
        const total = items.reduce((s, r) => s + (section.bucket === "at_risk" ? r.customer.amountCents : r.customer.mrrCents), 0);
        const currency = items[0].customer.currency;

        return (
          <section key={section.bucket}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                  {section.title}
                  <span className="ml-2 text-ink-3">{items.length}</span>
                </h3>
                <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-ink-3">{section.blurb}</p>
              </div>
              <div className="tnum text-[13px] text-ink-2">
                {formatMoney(total, currency)}
                <span className="text-ink-3">{section.bucket === "at_risk" ? " unpaid" : "/mo"}</span>
              </div>
            </div>

            <Card className="divide-y divide-line overflow-hidden">
              {items.map((row) => {
                const c = row.customer;
                const isOpen = open === row.key;
                const amount = section.bucket === "at_risk" ? c.amountCents : c.mrrCents;
                return (
                  <div key={row.key}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3.5 sm:flex-nowrap sm:px-4">
                      <button onClick={() => setOpen(isOpen ? null : row.key)} className="min-w-0 flex-1 text-left" aria-expanded={isOpen}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[14px] font-medium text-ink">{c.name ?? c.email ?? "Customer"}</span>
                          {c.priority >= 70 ? <Pill tone="soon">High value</Pill> : null}
                          {statusPill(row)}
                        </div>
                        <div className="mt-0.5 truncate text-[12.5px] text-ink-3">
                          {c.planName} · {subline(c)}
                        </div>
                      </button>

                      <div className="tnum shrink-0 text-right">
                        <div className="text-[14px] font-semibold text-ink">{formatMoney(amount, c.currency)}</div>
                        <div className="text-[12px] text-ink-3">{section.bucket === "at_risk" ? "unpaid" : `${formatMoney(c.mrrCents, c.currency)}/mo`}</div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setOpen(isOpen ? null : row.key)}>
                          {isOpen ? "Hide emails" : "See emails"}
                        </Button>
                        {onStart && row.status !== "active" && row.status !== "recovered" && row.status !== "closed" ? (
                          <Button size="sm" onClick={() => onStart(row)} disabled={busyKey === row.key || !c.email}>
                            {busyKey === row.key ? "Starting…" : row.status === "paused" ? "Resume" : "Start chasing"}
                          </Button>
                        ) : null}
                        {onPause && row.status === "active" ? (
                          <Button variant="secondary" size="sm" onClick={() => onPause(row)} disabled={busyKey === row.key}>
                            Pause
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="fade border-t border-line bg-raised/60 px-3.5 py-4 sm:px-4">
                        <p className="eyebrow mb-3">What gets sent, and when</p>
                        <div className="space-y-3">
                          {row.previews.map((preview, i) => (
                            <div key={i} className="rounded-lg border border-line bg-surface p-3.5">
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                                <span className="rounded bg-raised px-1.5 py-0.5 font-medium text-ink-2">
                                  {preview.dayOffset === 0 ? "Immediately" : `Day ${preview.dayOffset}`}
                                </span>
                                <span>{preview.label}</span>
                              </div>
                              <p className="text-[13.5px] font-semibold text-ink">{preview.subject}</p>
                              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{preview.body}</p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-[12.5px] text-ink-3">Sends stop automatically the moment the payment lands.</p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
