import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import type { SequenceSet, SequenceStep } from "../recovery/sequence";
import { STEP_SCHEDULE } from "../recovery/sequence";
import { defaultSequences, type Tone } from "../recovery/templates";
import type { Bucket } from "../recovery/scan";

export interface DraftInput {
  productName: string;
  founderName: string;
  tone: Tone;
  /** Optional: how the founder describes the product, used for voice only. */
  productDescription?: string;
}

const ALLOWED_VARS = new Set([
  "first_name",
  "name",
  "product",
  "founder",
  "plan",
  "amount",
  "mrr",
  "pay_url",
  "days_late",
  "decline_hint",
  "card_last4",
  "expiry",
  "days_until_expiry",
  "attempts",
]);

const BANNED = [
  /\bunlock\s+your\s+potential\b/i,
  /\brevolutioni[sz]e\b/i,
  /\bgame[- ]?chang(er|ing)\b/i,
  /\bsynerg/i,
  /\bleverage\s+the\s+power\b/i,
  /\bdear\s+valued\s+customer\b/i,
  /\bact\s+now\b/i,
  /\bdon'?t\s+miss\s+out\b/i,
  /\bcredit\s*card\s*number\b/i,
  /\bcvv\b/i,
  /\bssn\b/i,
];

export class DraftRejected extends Error {}

/** Every guardrail the model output has to survive before it can be sent to a customer. */
export function validateSequences(input: unknown, tone: Tone): SequenceSet {
  const fallback = defaultSequences(tone);
  if (typeof input !== "object" || input === null) throw new DraftRejected("not an object");
  const raw = input as Record<string, unknown>;
  const out = {} as SequenceSet;

  for (const bucket of ["at_risk", "lost", "expiring"] as Bucket[]) {
    const steps = raw[bucket];
    const expected = STEP_SCHEDULE[bucket];
    if (!Array.isArray(steps) || steps.length !== expected.length) throw new DraftRejected(`${bucket}: expected ${expected.length} steps`);

    out[bucket] = steps.map((s, i): SequenceStep => {
      if (typeof s !== "object" || s === null) throw new DraftRejected(`${bucket}[${i}]: not an object`);
      const step = s as Record<string, unknown>;
      const subject = String(step.subject ?? "").trim();
      const body = String(step.body ?? "").trim();
      const label = String(step.label ?? fallback[bucket][i].label).trim().slice(0, 24);

      if (subject.length < 3 || subject.length > 120) throw new DraftRejected(`${bucket}[${i}]: subject length`);
      if (body.length < 80 || body.length > 1800) throw new DraftRejected(`${bucket}[${i}]: body length`);
      if (!body.includes("{pay_url}")) throw new DraftRejected(`${bucket}[${i}]: missing {pay_url}`);
      if (/<[a-z][\s\S]*>/i.test(body)) throw new DraftRejected(`${bucket}[${i}]: html not allowed`);
      for (const pattern of BANNED) {
        if (pattern.test(body) || pattern.test(subject)) throw new DraftRejected(`${bucket}[${i}]: banned phrase`);
      }
      for (const [, name] of `${subject} ${body}`.matchAll(/\{(\w+)\}/g)) {
        if (!ALLOWED_VARS.has(name)) throw new DraftRejected(`${bucket}[${i}]: unknown variable {${name}}`);
      }
      return { dayOffset: expected[i], label, subject, body };
    });
  }
  return out;
}

const SYSTEM = `You write short, plain, personal emails that a solo software founder sends to a customer whose card payment failed. You are writing reusable templates, not one-off messages.

Rules:
- Sound like one human emailing another. No marketing voice, no exclamation marks, no emoji, no bullet lists.
- Plain text only. No HTML, no markdown links, no images.
- Never ask for card numbers, CVV, or any payment detail in the email. The only call to action is the link {pay_url}.
- Every body must contain {pay_url} exactly once, on its own line.
- Keep bodies between 400 and 900 characters.
- Assume the failure is an accident, not a decision. Never shame the customer.
- Later steps in a sequence get shorter and slightly more direct, never angrier.

Available variables (use only these, in curly braces): {first_name} {product} {founder} {plan} {amount} {mrr} {pay_url} {days_late} {decline_hint} {card_last4} {expiry} {days_until_expiry} {attempts}.
{decline_hint} expands to a clause like "the card on file has expired" — put it mid-sentence.`;

const userPrompt = (input: DraftInput) => `Product: ${input.productName}
Founder's name: ${input.founderName || "the founder"}
Tone: ${input.tone}
${input.productDescription ? `What it does: ${input.productDescription}\n` : ""}
Write three email sequences as JSON with keys "at_risk", "lost", "expiring".

"at_risk" — 4 steps, sent on days 0, 3, 7 and 12 after a renewal payment failed while the subscription is still alive. Step 3 warns that access pauses. Step 4 is the last email before cancellation.
"lost" — 3 steps, sent on days 0, 4 and 10 to someone whose subscription was ALREADY cancelled automatically because their card kept failing. They did not choose to leave. Ask whether they meant to go; offer to restore.
"expiring" — 2 steps, sent 14 and 7 days before the card on file expires, before anything has failed. Mention {card_last4} and {expiry}.

Each step is an object: {"label": "2-3 words", "subject": "...", "body": "..."}.
Respond with only the JSON object.`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new DraftRejected("no JSON found");
  return JSON.parse(candidate.slice(start, end + 1));
}

export interface DraftResult {
  sequences: SequenceSet;
  source: "anthropic" | "templates";
  reason?: string;
}

/**
 * One AI call per connection (not per customer), cached in the DB.
 * Falls back to the deterministic templates on any failure.
 */
export async function draftSequences(input: DraftInput): Promise<DraftResult> {
  if (!env.anthropicApiKey) return { sequences: defaultSequences(input.tone), source: "templates", reason: "no_api_key" };

  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const response = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt(input) }],
    });
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { sequences: validateSequences(extractJson(text), input.tone), source: "anthropic" };
  } catch (e) {
    return { sequences: defaultSequences(input.tone), source: "templates", reason: e instanceof Error ? e.message : "unknown_error" };
  }
}
