"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, inputClass } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Couldn't send that code.");
      setDevCode(data.devCode ?? null);
      setStage("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "That code didn't work.");
      router.push("/app");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (stage === "email") {
    return (
      <form onSubmit={requestCode} className="space-y-4">
        <Field label="Email address" error={error}>
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="you@yourproduct.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      {devCode ? (
        <div className="rounded-lg border border-line bg-soon-bg px-3.5 py-3 text-[13px] leading-relaxed text-soon">
          No email provider is configured on this deployment, so here is your code:{" "}
          <span className="tnum font-semibold">{devCode}</span>. Set <code className="font-mono">RESEND_API_KEY</code> to send it
          for real.
        </div>
      ) : (
        <p className="text-[14px] text-ink-2">
          We sent a code to <span className="font-medium text-ink">{email}</span>.
        </p>
      )}
      <Field label="Six-digit code" error={error}>
        <input
          className={`${inputClass} tnum text-center text-[22px] tracking-[0.3em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
        {busy ? "Checking…" : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setStage("email");
          setCode("");
          setError(null);
        }}
        className="w-full text-center text-[13px] text-ink-3 underline-offset-4 hover:text-ink hover:underline"
      >
        Use a different email
      </button>
    </form>
  );
}
