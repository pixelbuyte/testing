import Link from "next/link";
import type { ReactNode } from "react";
import type { PlanLimits } from "@/lib/plan";
import { Logo, Pill } from "./ui";
import { SignOut } from "./sign-out";

export function AppShell({ email, plan, children }: { email: string; plan: PlanLimits; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-3">
            <Link href="/app">
              <Logo className="text-[15px]" />
            </Link>
            <Pill tone={plan.id === "free" ? "neutral" : "good"}>{plan.name}</Pill>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/settings" className="rounded-lg px-3 py-2 text-[13.5px] text-ink-2 hover:bg-raised hover:text-ink">
              Settings
            </Link>
            <span className="hidden max-w-[180px] truncate text-[13px] text-ink-3 sm:block">{email}</span>
            <SignOut />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8 sm:py-10">{children}</main>
    </div>
  );
}
