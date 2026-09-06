import { describe, expect, it } from "vitest";
import { EXPIRY_LEAD_DAYS, declineHint, firstNameOf, isExhausted, render, sequenceStartAt, STEP_SCHEDULE, stepSendAt } from "@/lib/recovery/sequence";
import { defaultSequences } from "@/lib/recovery/templates";
import { validateSequences, DraftRejected } from "@/lib/ai/draft";
import { normalizeToMonthlyCents, formatMoney } from "@/lib/money";
import { createSessionToken, secureCookieRequired, verifySessionToken } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";

const NOW = 1_770_000_000;
const DAY = 86_400;

describe("scheduling", () => {
  it("sends the first at-risk email immediately and the last on day 12", () => {
    expect(stepSendAt(NOW, "at_risk", 0)).toBe(NOW);
    expect(stepSendAt(NOW, "at_risk", 3)).toBe(NOW + 12 * DAY);
    expect(stepSendAt(NOW, "at_risk", 4)).toBeNull();
  });

  it("starts an expiry sequence 14 days before the card dies, not today", () => {
    expect(sequenceStartAt("expiring", NOW, 30)).toBe(NOW + (30 - EXPIRY_LEAD_DAYS) * DAY);
    expect(sequenceStartAt("expiring", NOW, 5)).toBe(NOW);
    expect(sequenceStartAt("at_risk", NOW, null)).toBe(NOW);
  });

  it("knows when a sequence is finished", () => {
    expect(isExhausted("lost", 2)).toBe(false);
    expect(isExhausted("lost", 3)).toBe(true);
  });
});

describe("templates", () => {
  const vars = {
    first_name: "Ada",
    name: "Ada Lovelace",
    product: "Acme",
    founder: "Sam",
    plan: "Growth",
    amount: "$79",
    mrr: "$79",
    pay_url: "https://pay.example",
    days_late: "4",
    decline_hint: "the card on file has expired",
    card_last4: "4242",
    expiry: "March 2027",
    days_until_expiry: "12",
    attempts: "2",
  };

  it("fills every placeholder in every default template", () => {
    for (const tone of ["friendly", "direct", "formal"] as const) {
      const sequences = defaultSequences(tone);
      for (const steps of Object.values(sequences)) {
        for (const step of steps) {
          const body = render(step.body, vars);
          const subject = render(step.subject, vars);
          expect(body).not.toMatch(/\{\w+\}/);
          expect(subject).not.toMatch(/\{\w+\}/);
          expect(body).toContain("https://pay.example");
        }
      }
    }
  });

  it("matches the declared step counts", () => {
    const sequences = defaultSequences("friendly");
    for (const bucket of ["at_risk", "lost", "expiring"] as const) {
      expect(sequences[bucket]).toHaveLength(STEP_SCHEDULE[bucket].length);
    }
  });

  it("derives a usable first name from a name or an email", () => {
    expect(firstNameOf("Ada Lovelace", null)).toBe("Ada");
    expect(firstNameOf(null, "ada.lovelace@example.com")).toBe("ada");
    expect(firstNameOf(null, null)).toBe("there");
  });

  it("explains decline codes in plain language and degrades gracefully", () => {
    expect(declineHint("expired_card")).toContain("expired");
    expect(declineHint("some_new_code")).toContain("some new code");
    expect(declineHint(null)).toBe("the payment didn't go through");
  });
});

describe("AI guardrails", () => {
  const good = defaultSequences("friendly");

  it("accepts well-formed sequences", () => {
    expect(() => validateSequences(good, "friendly")).not.toThrow();
  });

  it("rejects a sequence missing the pay link", () => {
    const bad = structuredClone(good);
    bad.at_risk[0].body = bad.at_risk[0].body.replace("{pay_url}", "call me");
    expect(() => validateSequences(bad, "friendly")).toThrow(DraftRejected);
  });

  it("rejects unknown template variables", () => {
    const bad = structuredClone(good);
    bad.lost[0].body += " {secret_internal_field}";
    expect(() => validateSequences(bad, "friendly")).toThrow(DraftRejected);
  });

  it("rejects marketing filler and HTML", () => {
    const filler = structuredClone(good);
    filler.expiring[0].subject = "Revolutionize your workflow";
    expect(() => validateSequences(filler, "friendly")).toThrow(DraftRejected);

    const html = structuredClone(good);
    html.expiring[0].body = `<div>${html.expiring[0].body}</div>`;
    expect(() => validateSequences(html, "friendly")).toThrow(DraftRejected);
  });

  it("rejects a sequence with the wrong number of steps", () => {
    const bad = structuredClone(good);
    bad.at_risk = bad.at_risk.slice(0, 2);
    expect(() => validateSequences(bad, "friendly")).toThrow(DraftRejected);
  });

  it("rejects anything asking for card details", () => {
    const bad = structuredClone(good);
    bad.at_risk[1].body = `Reply with your credit card number and CVV.\n{pay_url}\n${bad.at_risk[1].body}`;
    expect(() => validateSequences(bad, "friendly")).toThrow(DraftRejected);
  });
});

describe("money", () => {
  it("normalises billing intervals to monthly cents", () => {
    expect(normalizeToMonthlyCents(1200, "year", 1, 1)).toBe(100);
    expect(normalizeToMonthlyCents(1000, "month", 1, 3)).toBe(3000);
    expect(normalizeToMonthlyCents(1000, "month", 3, 1)).toBe(333);
    expect(normalizeToMonthlyCents(100, "week", 1, 1)).toBe(435);
  });

  it("formats zero-decimal currencies without cents", () => {
    expect(formatMoney(1000, "jpy")).toBe("¥1,000");
    expect(formatMoney(129_900, "usd")).toBe("$1,299");
    expect(formatMoney(12_950, "usd")).toBe("$129.50");
  });
});

describe("security", () => {
  it("round-trips an encrypted Stripe key", async () => {
    const key = "rk_test_51abcdefghijklmnop";
    expect(await decrypt(await encrypt(key))).toBe(key);
  });

  it("produces a different ciphertext each time", async () => {
    expect(await encrypt("same")).not.toBe(await encrypt("same"));
  });

  it("accepts its own session token and rejects tampering or expiry", () => {
    const token = createSessionToken("usr_1");
    expect(verifySessionToken(token)).toBe("usr_1");
    expect(verifySessionToken(`${token}x`)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken(createSessionToken("usr_1", Date.now() - 40 * 86_400_000))).toBeNull();
  });
});

describe("session cookie security", () => {
  it("marks the cookie Secure on a real https deployment", () => {
    expect(secureCookieRequired("https://pastdue.app", true)).toBe(true);
    expect(secureCookieRequired("https://pastdue.app", false)).toBe(true);
  });

  it("does not mark it Secure on plain-http localhost, so local prod builds still log in", () => {
    expect(secureCookieRequired("http://localhost:3000", true)).toBe(false);
    expect(secureCookieRequired("http://127.0.0.1:3000", true)).toBe(false);
  });

  it("still marks it Secure for a non-local http deployment", () => {
    expect(secureCookieRequired("http://app.internal", true)).toBe(true);
  });
});
