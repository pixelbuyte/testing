export type Interval = "day" | "week" | "month" | "year";

export function normalizeToMonthlyCents(
  unitAmountCents: number,
  interval: Interval,
  intervalCount: number,
  quantity: number,
): number {
  const total = unitAmountCents * Math.max(1, quantity);
  const count = Math.max(1, intervalCount);
  switch (interval) {
    case "day":
      return Math.round((total * 30.4) / count);
    case "week":
      return Math.round((total * 4.345) / count);
    case "month":
      return Math.round(total / count);
    case "year":
      return Math.round(total / (12 * count));
  }
}

const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "clp", "isk", "huf", "twd", "ugx"]);

export function formatMoney(cents: number, currency = "usd", opts: { compact?: boolean } = {}) {
  const cur = currency.toLowerCase();
  const amount = ZERO_DECIMAL.has(cur) ? cents : cents / 100;
  const fractionDigits = ZERO_DECIMAL.has(cur) ? 0 : Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur.toUpperCase(),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    notation: opts.compact ? "compact" : "standard",
  }).format(amount);
}

export function daysBetween(fromUnixSeconds: number, toUnixSeconds: number) {
  return Math.floor((toUnixSeconds - fromUnixSeconds) / 86_400);
}
