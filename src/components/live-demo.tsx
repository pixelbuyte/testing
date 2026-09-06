"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoPayload } from "@/lib/demo";
import { formatMoney } from "@/lib/money";
import { ScanView, type RecoveryRow } from "./scan-view";
import { Button, ButtonLink, Card, Stat } from "./ui";

type Phase = "idle" | "scanning" | "done" | "error";

const STEPS = [
  "Reading subscriptions…",
  "Checking invoice attempts…",
  "Finding cancellations caused by dead cards…",
  "Checking cards about to expire…",
];

export function LiveDemo({ autoStart = false }: { autoStart?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [data, setData] = useState<DemoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setPhase("scanning");
    setStep(0);
    setError(null);
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 420);
    try {
      const [response] = await Promise.all([fetch("/api/demo"), new Promise((r) => setTimeout(r, 1500))]);
      if (!response.ok) throw new Error("The demo scan failed. Try again.");
      setData((await response.json()) as DemoPayload);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("error");
    } finally {
      clearInterval(ticker);
    }
  }, []);

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void run();
    }
  }, [autoStart, run]);

  const rows: RecoveryRow[] =
    data?.scan
      ? [...data.scan.atRisk, ...data.scan.lost, ...data.scan.expiring].map((c) => ({
          key: c.subscriptionId,
          customer: c,
          previews: data.previews[c.subscriptionId] ?? [],
        }))
      : [];

  return (
    <div>
      {phase === "idle" ? (
        <Card className="p-8 text-center sm:p-12">
          <p className="eyebrow">Live demo · no signup</p>
          <h3 className="display mt-3 text-[26px] font-semibold sm:text-[32px]">Run it on a sample Stripe account</h3>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-ink-2">
            22 subscriptions, the kind of mess a real $8k MRR account is in. See what it finds, and read the exact emails it would send.
          </p>
          <Button size="lg" className="mt-6" onClick={run}>
            Scan the demo account
          </Button>
          <p className="mt-3 text-[13px] text-ink-3">Takes about four seconds.</p>
        </Card>
      ) : null}

      {phase === "scanning" ? (
        <Card className="p-8 sm:p-12">
          <div className="mx-auto max-w-sm">
            <div className="scanning relative h-1 overflow-hidden rounded-full bg-raised" />
            <p className="mt-5 text-center text-[15px] font-medium text-ink">{STEPS[step]}</p>
            <div className="mt-4 space-y-1.5">
              {STEPS.map((s, i) => (
                <div key={s} className={`flex items-center gap-2 text-[13px] ${i <= step ? "text-ink-2" : "text-ink-3/50"}`}>
                  <span className={`inline-block size-1.5 rounded-full ${i < step ? "bg-good" : i === step ? "bg-ink-2" : "bg-line-strong"}`} />
                  {s}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {phase === "error" ? (
        <Card className="p-8 text-center">
          <p className="text-[15px] font-medium text-ink">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={run}>
            Try again
          </Button>
        </Card>
      ) : null}

      {phase === "done" && data ? (
        <div className="rise space-y-6">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="text-[13px] text-ink-2">
                Scanned <span className="font-medium text-ink">{data.product}</span> · {data.scan.activeSubscriptions} active subscriptions ·{" "}
                <span className="tnum">{formatMoney(data.scan.activeMrrCents, data.scan.currency)}</span>/mo
              </div>
              <button onClick={run} className="text-[13px] text-ink-3 underline-offset-4 hover:text-ink hover:underline">
                Re-run
              </button>
            </div>
            <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Stat
                label="Unpaid right now"
                value={formatMoney(data.scan.totals.atRiskCents, data.scan.currency)}
                sub={`${data.scan.atRisk.length} subscriptions still retrying`}
                tone="risk"
              />
              <Stat
                label="Already cancelled by a dead card"
                value={`${formatMoney(data.scan.totals.lostAnnualCents, data.scan.currency)}/yr`}
                sub={`${data.scan.lost.length} customers Stripe gave up on`}
                tone="lost"
              />
              <Stat
                label="Cards expiring in 30 days"
                value={`${formatMoney(data.scan.totals.expiringMrrCents, data.scan.currency)}/mo`}
                sub={`${data.scan.expiring.length} about to fail`}
                tone="soon"
              />
            </div>
          </Card>

          <div className="rounded-xl border border-line bg-raised/50 px-4 py-3.5 text-[14px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">
              {formatMoney(data.scan.totals.recoverableCents, data.scan.currency)} of annualised revenue is sitting in these three lists
            </span>{" "}
            — and every one of these customers stopped hearing from Stripe. Open any row to read the emails PastDue would send.
          </div>

          <ScanView rows={rows} />

          <Card className="flex flex-col items-center gap-3 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="text-[15px] font-medium text-ink">Now run it on your own Stripe account.</p>
              <p className="mt-0.5 text-[13.5px] text-ink-3">Read-only restricted key. Takes about 40 seconds, and the scan is free forever.</p>
            </div>
            <ButtonLink href="/login" size="lg" className="shrink-0">
              Scan my Stripe
            </ButtonLink>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
