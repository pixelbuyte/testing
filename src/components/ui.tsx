import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap";

const buttonSizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4", lg: "h-12 px-6 text-[15px]" };

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/88",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-raised",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
  danger: "border border-line-strong bg-surface text-lost hover:bg-lost-bg",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return <button className={`${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return <Link className={`${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

const toneStyles = {
  risk: "bg-risk-bg text-risk",
  lost: "bg-lost-bg text-lost",
  soon: "bg-soon-bg text-soon",
  good: "bg-good-bg text-good",
  neutral: "bg-raised text-ink-2",
} as const;

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof toneStyles; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight ${toneStyles[tone]}`}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-[13px] text-lost">{error}</span> : hint ? <span className="mt-1.5 block text-[13px] text-ink-3">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:outline-none";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="0.75" y="0.75" width="16.5" height="16.5" rx="4.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 4.5v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      PastDue
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof toneStyles;
}) {
  const accents = { risk: "text-risk", lost: "text-lost", soon: "text-soon", good: "text-good", neutral: "text-ink" } as const;
  return (
    <div className="p-4 sm:p-5">
      <div className="eyebrow">{label}</div>
      <div className={`tnum mt-2 text-[26px] font-semibold tracking-tight sm:text-[30px] ${accents[tone]}`}>{value}</div>
      {sub ? <div className="mt-1 text-[13px] text-ink-3">{sub}</div> : null}
    </div>
  );
}
