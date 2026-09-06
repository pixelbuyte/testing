# PastDue

**Stripe retries the card. Nobody retries the customer.**

After roughly eight failed attempts Stripe marks a subscription `canceled` or `unpaid` and stops emailing.
That customer did not decide to leave — their card expired. PastDue finds every one of them and wins them
back in the founder's own voice.

For a solo founder billing through Stripe, it automatically finds every subscription that failed, expired or
was cancelled by a dead card, and runs a personal win-back sequence with a one-click pay link until the money
comes back — so they no longer have to notice the MRR dip weeks later and write awkward emails by hand.

The product decision and the research behind it are in [`docs/research.md`](docs/research.md): 29 candidate
problems drawn from real user complaints, scored, with the top five put through a customer test and the
winner run through a pre-mortem.

## What it does

Paste a Stripe **restricted key** (read-only, plus permission to create Checkout sessions) and PastDue
produces three lists nobody keeps:

| Bucket | What it means | Stripe's behaviour |
| --- | --- | --- |
| **Failing now** | `past_due` / `unpaid` subscriptions with an open invoice | Still retrying, sends a generic email |
| **Already lost** | Cancelled in the last 90 days with `cancellation_details.reason = payment_failed` | Gave up and went silent |
| **About to fail** | Active subscription whose card expires within 30 days | Only warns if the card brand supports auto-update |

Press start on a row and it runs a sequence — 4 emails over 12 days for a failing payment, 3 over 10 days for
a win-back, 2 in the fortnight before a card expires. Every email comes from the founder's name, carries a
Stripe-hosted pay link, and the sequence stops the moment the subscription is healthy again.

The row ordering is deliberate: a customer's monthly revenue, how long they have been paying, and how urgent
the deadline is combine into a priority score, so the account worth a personal phone call is at the top.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Nothing needs to be configured to try it. With no environment variables at all:

- the database is an embedded PGlite instance under `./.data/pglite`
- sign-in codes are shown on screen instead of emailed
- customer emails are written to an in-memory outbox readable at `/api/outbox`
- email copy comes from the built-in templates
- everyone is on the free plan

Type `demo` instead of a Stripe key to load a sample account with 22 subscriptions, or use the live demo on
the landing page, which needs no account at all.

### Checks

```bash
npm run check        # lint, typecheck, tests, production build
npm test             # 32 unit tests
```

The whole new-user journey is also driven in a real browser:

```bash
npm run build
CRON_SECRET=journey-cron-secret npx next start --port 3800 &
node scripts/journey.mjs http://localhost:3800
```

34 checks covering the landing page, the live demo, sign-in (including a wrong code), connecting Stripe
(including a rejected publishable key), the free-plan cap, pausing, settings, the cron send loop, mobile
layout at 390px, a failing API, and a slow API.

## Deploying

1. **Database.** Create a Postgres database (Neon, Supabase, RDS) and set `DATABASE_URL`. The schema is
   applied automatically on first connection, so there is no migration step.
2. **Secrets.** Set `APP_SECRET` to 32+ random characters (`openssl rand -base64 32`). It signs sessions and
   encrypts every stored Stripe key, so treat it as irreplaceable. Set `NEXT_PUBLIC_APP_URL` to the real
   https origin.
3. **Email.** Verify a sending domain in Resend, then set `RESEND_API_KEY` and `EMAIL_FROM`. Until you do,
   PastDue will not email anybody.
4. **Cron.** Set `CRON_SECRET`. On Vercel, `vercel.json` already schedules `/api/cron` hourly; elsewhere call
   it with `Authorization: Bearer $CRON_SECRET`.
5. **Billing (optional).** Create two Stripe prices and set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STANDARD`,
   `STRIPE_PRICE_PRO`, and `STRIPE_WEBHOOK_SECRET` for a webhook pointed at `/api/billing/webhook`
   subscribed to `checkout.session.completed`, `customer.subscription.updated` and
   `customer.subscription.deleted`.
6. **AI (optional).** Set `ANTHROPIC_API_KEY` to have email sequences drafted for the specific product.

```bash
vercel deploy --prod
```

See `.env.example` for every variable and what happens when it is missing.

## How it is built

```
src/lib/stripe/      StripeSource interface, live Stripe client, fixture account for the demo
src/lib/recovery/    the classifier, the sequence schedule, the default templates
src/lib/ai/          Claude drafting with hard guardrails and a template fallback
src/lib/engine.ts    sync scan → recovery rows, start/pause, the due-send loop
src/lib/db/          Drizzle schema, idempotent DDL, Postgres or PGlite
src/app/api/         demo, auth, connections, scan, recoveries, settings, billing, cron
```

Deliberately deterministic: classification, prioritisation, scheduling, currency normalisation, and
stop-on-payment are all plain code. The model is called **once per connection**, not per customer, to draft
the three sequences. Its output must survive validation — exactly the right number of steps, a `{pay_url}`
in every body, no HTML, no unknown template variables, no marketing filler, nothing asking for card details —
or the built-in templates are used instead. That keeps the AI cost per customer under a cent and means a bad
model day cannot produce a bad email.

**Safety properties.** Stripe keys are encrypted with AES-GCM before they touch the database. The app only
ever asks for read scopes plus Checkout write, so it cannot charge a card or issue a refund. Customers only
ever enter payment details on Stripe-hosted pages. Before every single send, the subscription is re-checked
against Stripe so a customer who has already paid is never chased.

Not affiliated with Stripe. Stripe is a trademark of Stripe, Inc.
