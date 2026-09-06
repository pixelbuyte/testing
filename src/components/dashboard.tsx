"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ScanResult } from "@/lib/recovery/scan";
import type { PlanLimits } from "@/lib/plan";
import { formatMoney } from "@/lib/money";
import { ScanView, type RecoveryRow } from "./scan-view";
import { Button, ButtonLink, Card, Pill, Stat } from "./ui";

interface ConnectionSummary {
  productName: string;
  founderName: string;
  keyLast4: string;
  livemode: boolean;
  isDemo: boolean;
  autoSend: boolean;
  lastScanAt: string | null;
  sequencesSource: string;
}

function relative(iso: string | null) {
  if (!iso) return "never";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
}

export function Dashboard({
  rows,
  scan,
  recovered,
  connection,
  plan,
  emailMode,
  justUpgraded,
}: {
  rows: RecoveryRow[];
  scan: ScanResult | null;
  recovered: { count: number; cents: number };
  connection: ConnectionSummary;
  plan: PlanLimits;
  emailMode: string;
  justUpgraded: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(justUpgraded ? "You're on the paid plan. Auto-send is available in Settings." : null);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const [scanning, setScanning] = useState(false);

  const currency = scan?.currency ?? "usd";
  const activeCount = rows.filter((r) => r.status === "active").length;

  async function act(row: RecoveryRow, action: "start" | "pause") {
    setBusyKey(row.key);
    setNotice(null);
    try {
      const response = await fetch(`/api/recoveries/${row.recoveryId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setUpgradeNeeded(Boolean(data.upgrade));
        throw new Error(data.error ?? "That didn't work.");
      }
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyKey(null);
    }
  }

  async function rescan() {
    setScanning(true);
    setNotice(null);
    try {
      const response = await fetch("/api/scan", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Stripe didn't respond.");
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setScanning(false);
    }
  }

  async function upgrade(planId: "standard" | "pro") {
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });
    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setNotice(data.error ?? "Checkout is unavailable.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">{connection.productName}</h1>
            {connection.isDemo ? <Pill tone="soon">Demo data</Pill> : connection.livemode ? <Pill tone="good">Live</Pill> : <Pill tone="neutral">Test mode</Pill>}
          </div>
          <p className="mt-1 text-[13px] text-ink-3">
            Key ••••{connection.keyLast4} · scanned {relative(connection.lastScanAt)}
            {connection.sequencesSource === "anthropic" ? " · emails drafted for your product" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={rescan} disabled={scanning}>
            {scanning ? "Scanning…" : "Rescan"}
          </Button>
          <ButtonLink href="/app/settings" variant="secondary">
            Settings
          </ButtonLink>
        </div>
      </div>

      {notice ? (
        <div className="rounded-lg border border-line bg-soon-bg px-4 py-3 text-[13.5px] text-soon">
          {notice}
          {upgradeNeeded ? (
            <button onClick={() => upgrade("standard")} className="ml-2 font-semibold underline underline-offset-2">
              Upgrade to Standard
            </button>
          ) : null}
        </div>
      ) : null}

      {emailMode === "outbox" ? (
        <div className="rounded-lg border border-line bg-raised px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          No email provider is configured, so sends are written to an outbox instead of going to customers. Everything else
          behaves normally. Set <code className="font-mono text-ink">RESEND_API_KEY</code> to send for real.
        </div>
      ) : null}

      {scan ? (
        <Card className="grid divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <Stat label="Unpaid now" value={formatMoney(scan.totals.atRiskCents, currency)} sub={`${scan.atRisk.length} failing`} tone="risk" />
          <Stat
            label="Lost to dead cards"
            value={`${formatMoney(scan.totals.lostAnnualCents, currency)}/yr`}
            sub={`${scan.lost.length} cancelled`}
            tone="lost"
          />
          <Stat label="Chasing" value={String(activeCount)} sub={plan.activeSequences === Number.POSITIVE_INFINITY ? "no limit" : `${plan.activeSequences} max on ${plan.name}`} />
          <Stat label="Recovered" value={formatMoney(recovered.cents, currency)} sub={`${recovered.count} customers back`} tone="good" />
        </Card>
      ) : null}

      {plan.id === "free" && rows.length > 0 ? (
        <Card className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            You&apos;re on Free: {plan.activeSequences} sequences at a time, and you approve each one. Standard chases every failure
            automatically for ${15}/month.
          </p>
          <Button onClick={() => upgrade("standard")} className="shrink-0">
            Upgrade
          </Button>
        </Card>
      ) : null}

      <ScanView
        rows={rows}
        busyKey={busyKey}
        onStart={(row) => act(row, "start")}
        onPause={(row) => act(row, "pause")}
        emptyNote="Nothing is failing right now. PastDue rescans every hour and will surface anything new here."
      />
    </div>
  );
}
