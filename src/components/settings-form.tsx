"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlanLimits } from "@/lib/plan";
import { Button, Card, Field, inputClass, Pill } from "./ui";

interface ConnectionSettings {
  productName: string;
  founderName: string;
  replyTo: string;
  tone: string;
  autoSend: boolean;
  keyLast4: string;
  sequencesSource: string;
}

const TONES = [
  { id: "friendly", label: "Friendly", sample: "It happens all the time and nothing has changed on your account yet." },
  { id: "direct", label: "Direct", sample: "Still seeing the renewal as unpaid on my side." },
  { id: "formal", label: "Formal", sample: "Hello Priya, your renewal did not complete." },
];

export function SettingsForm({
  connection,
  plan,
  caps,
}: {
  connection: ConnectionSettings;
  plan: PlanLimits;
  caps: { db: string; email: string; ai: string; billing: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState(connection);
  const [busy, setBusy] = useState<null | "save" | "redraft">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(extra: Record<string, unknown> = {}, mode: "save" | "redraft" = "save") {
    setBusy(mode);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Couldn't save that.");
      setNotice(mode === "redraft" ? "Rewrote your email sequences." : "Saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-[13.5px] text-ink-3">Stripe key ••••{connection.keyLast4}</p>
      </div>

      {notice ? <div className="rounded-lg border border-line bg-good-bg px-4 py-3 text-[13.5px] text-good">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-line bg-lost-bg px-4 py-3 text-[13.5px] text-lost">{error}</div> : null}

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">How your emails read</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name">
            <input className={inputClass} value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
          </Field>
          <Field label="Your first name">
            <input className={inputClass} value={form.founderName} onChange={(e) => setForm({ ...form, founderName: e.target.value })} />
          </Field>
        </div>

        <Field label="Reply-to address" hint="Where replies from your customers land.">
          <input className={inputClass} type="email" value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} />
        </Field>

        <div>
          <span className="mb-2 block text-[13px] font-medium text-ink">Tone</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {TONES.map((tone) => (
              <button
                key={tone.id}
                type="button"
                onClick={() => setForm({ ...form, tone: tone.id })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  form.tone === tone.id ? "border-ink bg-raised" : "border-line hover:bg-raised"
                }`}
              >
                <span className="block text-[13.5px] font-medium text-ink">{tone.label}</span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-3">&ldquo;{tone.sample}&rdquo;</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-ink-3">Changing the tone rewrites all three sequences.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save()} disabled={busy !== null}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
          <Button variant="secondary" onClick={() => save({ redraft: true }, "redraft")} disabled={busy !== null}>
            {busy === "redraft" ? "Rewriting…" : "Rewrite my emails"}
          </Button>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-md">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">Auto-send</h2>
              {plan.autoSend ? null : <Pill tone="neutral">Standard</Pill>}
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
              When a new failure appears, start chasing it within the hour instead of waiting for you to press start. Sequences
              still stop the moment the payment lands.
            </p>
          </div>
          <Button
            variant={form.autoSend ? "secondary" : "primary"}
            onClick={() => {
              const next = !form.autoSend;
              setForm({ ...form, autoSend: next });
              void save({ autoSend: next });
            }}
            disabled={busy !== null || !plan.autoSend}
          >
            {form.autoSend ? "Turn off" : "Turn on"}
          </Button>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">This deployment</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
          {[
            ["Database", caps.db === "postgres" ? "Postgres" : "PGlite (local file)"],
            ["Email", caps.email === "resend" ? "Resend" : "Outbox only — nothing reaches customers"],
            ["Email drafting", caps.ai === "anthropic" ? "Claude, with fallback templates" : "Built-in templates"],
            ["Billing", caps.billing === "stripe" ? "Stripe Checkout" : "Not configured"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5">
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-right text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
