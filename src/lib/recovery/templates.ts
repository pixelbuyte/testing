import type { SequenceSet } from "./sequence";

export type Tone = "friendly" | "direct" | "formal";

/**
 * Deterministic founder-voice defaults. Used verbatim when no AI key is configured,
 * and as the fallback whenever AI drafting fails validation.
 */
export function defaultSequences(tone: Tone): SequenceSet {
  const sign = tone === "formal" ? "Kind regards,\n{founder}\n{product}" : tone === "direct" ? "— {founder}, {product}" : "Thanks,\n{founder}\nfounder, {product}";
  const hi = tone === "formal" ? "Hello {first_name}," : "Hi {first_name},";

  return {
    at_risk: [
      {
        dayOffset: 0,
        label: "Heads-up",
        subject: "Quick one about your {product} payment",
        body: `${hi}\n\nYour {plan} renewal ({amount}) didn't go through — {decline_hint}. It happens all the time and nothing has changed on your account yet.\n\nYou can fix it in about 20 seconds here:\n{pay_url}\n\nIf you'd rather I look into anything first, just reply to this email.\n\n${sign}`,
      },
      {
        dayOffset: 3,
        label: "Reminder",
        subject: "Re: your {product} payment",
        body: `${hi}\n\nStill seeing the {amount} renewal as unpaid on my side ({attempts} attempts so far). I don't want you to lose access to {product} over a card hiccup.\n\nUpdate the card or pay the invoice here:\n{pay_url}\n\nReply if the timing is off and I'll hold things for you.\n\n${sign}`,
      },
      {
        dayOffset: 7,
        label: "Access warning",
        subject: "{product}: your account will pause soon",
        body: `${hi}\n\nIt's been a week since the {plan} payment failed, so Stripe will stop retrying shortly and your account will pause. Everything you've set up stays safe — it just goes read-only until the invoice is paid.\n\nTake care of it here:\n{pay_url}\n\nIf you've decided to stop using {product}, no hard feelings — a one-line reply saying so helps me too.\n\n${sign}`,
      },
      {
        dayOffset: 12,
        label: "Final notice",
        subject: "Last note before your {product} subscription closes",
        body: `${hi}\n\nThis is the last email about the unpaid {amount} invoice. If it isn't paid in the next couple of days your subscription will be cancelled automatically.\n\nOne click to keep everything running:\n{pay_url}\n\nEither way, thank you for being a customer for {days_late} days past due and long before that.\n\n${sign}`,
      },
    ],
    lost: [
      {
        dayOffset: 0,
        label: "Win-back",
        subject: "Did you mean to leave {product}?",
        body: `${hi}\n\nI noticed your {plan} subscription was cancelled — not by you, but automatically after your card kept getting declined ({decline_hint}). That's usually an accident, so I wanted to check before assuming you'd left.\n\nIf you'd like to pick up where you left off, this restores your plan with a fresh card:\n{pay_url}\n\nYour data and settings are still here. If you did mean to cancel, just ignore this and I'll stop.\n\n${sign}`,
      },
      {
        dayOffset: 4,
        label: "Nudge",
        subject: "Re: Did you mean to leave {product}?",
        body: `${hi}\n\nFollowing up on my note about your cancelled {plan} plan ({mrr}/mo). Restoring it takes about a minute:\n{pay_url}\n\nIf something about {product} stopped working for you, I'd genuinely like to know — reply and I'll read it personally.\n\n${sign}`,
      },
      {
        dayOffset: 10,
        label: "Last call",
        subject: "Closing the loop on your {product} account",
        body: `${hi}\n\nLast one from me. Your {product} account stays recoverable for a while longer, and this link brings it back exactly as it was:\n{pay_url}\n\nAfter that I'll leave you alone. Thanks for the time you spent with us.\n\n${sign}`,
      },
    ],
    expiring: [
      {
        dayOffset: 0,
        label: "Card expiring",
        subject: "Your card on file for {product} expires {expiry}",
        body: `${hi}\n\nHeads-up: the card ending in {card_last4} that pays for your {plan} plan expires {expiry} — {days_until_expiry} days from now. If the bank hasn't sent a replacement automatically, your next renewal will fail.\n\nAdd a new card in under a minute:\n{pay_url}\n\nThat's it — nothing else changes.\n\n${sign}`,
      },
      {
        dayOffset: 7,
        label: "Reminder",
        subject: "Reminder: card ending {card_last4} expires soon",
        body: `${hi}\n\nQuick reminder that the card on your {product} account expires {expiry}. Updating it now avoids a failed renewal and any interruption:\n{pay_url}\n\nIf you've already updated it, sorry for the noise — you can ignore this.\n\n${sign}`,
      },
    ],
  };
}
