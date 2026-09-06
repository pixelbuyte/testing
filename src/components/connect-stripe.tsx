"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, inputClass } from "./ui";

const PERMISSIONS = [
  { name: "Subscriptions", level: "Read", why: "to find what's failing, cancelled, or healthy" },
  { name: "Invoices", level: "Read", why: "to see the amount, the attempts, and the decline reason" },
  { name: "Customers", level: "Read", why: "to know who to email and how long they've been with you" },
  { name: "Checkout Sessions", level: "Write", why: "to create the Stripe-hosted pay link in each email" },
];

export function ConnectStripe() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [productName, setProductName] = useState("");
  const [founderName, setFounderName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, productName, founderName, replyTo }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Stripe rejected that key.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display text-[28px] font-semibold sm:text-[34px]">Connect Stripe, read-only.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        PastDue needs a restricted key so it can see which subscriptions are failing. It cannot charge cards, issue refunds, or
        move money, and you can revoke it from your Stripe dashboard at any time.
      </p>

      <Card className="mt-7 p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-5">
          <Field
            label="Stripe restricted key"
            error={error}
            hint={
              <>
                Create one at{" "}
                <a
                  className="text-ink underline underline-offset-2"
                  href="https://dashboard.stripe.com/apikeys/create"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Stripe → Developers → API keys → Create restricted key
                </a>
                . Or type <code className="font-mono text-ink">demo</code> to load a sample account first.
              </>
            }
          >
            <input
              className={`${inputClass} font-mono text-[13px]`}
              placeholder="rk_live_…"
              autoComplete="off"
              spellCheck={false}
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>

          <div className="rounded-lg border border-line bg-raised/60 p-4">
            <p className="eyebrow mb-3">Permissions to enable</p>
            <ul className="space-y-2">
              {PERMISSIONS.map((p) => (
                <li key={p.name} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">{p.level}</span>
                  <span className="text-ink-3">{p.why}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-ink-3">Leave everything else set to None.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" hint="Used in the emails.">
              <input className={inputClass} placeholder="Acme Analytics" value={productName} onChange={(e) => setProductName(e.target.value)} />
            </Field>
            <Field label="Your first name" hint="Emails are signed by you.">
              <input className={inputClass} placeholder="Sam" value={founderName} onChange={(e) => setFounderName(e.target.value)} />
            </Field>
          </div>

          <Field label="Reply-to address" hint="Where customer replies land. Optional.">
            <input className={inputClass} type="email" placeholder="sam@acme.com" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
          </Field>

          <Button type="submit" size="lg" className="w-full" disabled={busy || key.trim().length < 3}>
            {busy ? "Scanning your account…" : "Connect and scan"}
          </Button>
          <p className="text-center text-[12.5px] text-ink-3">Nothing is emailed to anyone until you press start on a specific customer.</p>
        </form>
      </Card>
    </div>
  );
}
