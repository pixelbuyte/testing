import Link from "next/link";
import { LiveDemo } from "@/components/live-demo";
import { ButtonLink, Card, Logo, Pill } from "@/components/ui";
import { PLANS } from "@/lib/plan";
import { track } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const HOW = [
  {
    step: "01",
    title: "Paste a read-only Stripe key",
    body: "A restricted key with four read permissions. No OAuth dance, no app review, no access to move money. You can revoke it in one click from your Stripe dashboard.",
  },
  {
    step: "02",
    title: "See the three lists nobody keeps",
    body: "What's failing now, what Stripe already cancelled because the card kept dying, and which cards expire in the next 30 days. With names, amounts, and how long each person has been a customer.",
  },
  {
    step: "03",
    title: "It chases them in your voice",
    body: "A short sequence from your name, with a one-click pay link, escalating on a schedule that works. It stops the second the money lands, and tells you what came back.",
  },
];

const COMPARISON = [
  { row: "Retries the card on a smart schedule", stripe: true, us: false, note: "Stripe already does this well" },
  { row: "Emails the customer while retries continue", stripe: true, us: true, note: "Stripe's is generic and unbranded" },
  { row: "Keeps emailing after retries are exhausted", stripe: false, us: true, note: "Stripe cancels and goes silent" },
  { row: "Wins back subscriptions cancelled by a dead card", stripe: false, us: true, note: "Nobody asks these people to come back" },
  { row: "Warns before the card on file expires", stripe: true, us: true, note: "Only if the brand supports auto-updater" },
  { row: "Sends from the founder's name and address", stripe: false, us: true },
  { row: "Tells you which failure is worth a personal call", stripe: false, us: true },
  { row: "Shows what you actually recovered", stripe: false, us: true },
];

const FAQ = [
  {
    q: "Isn't this what Stripe Smart Retries does?",
    a: "Only for the first two weeks. Stripe retries up to eight times, sends a generic email, then marks the subscription canceled or unpaid and stops. Everything after that moment is a customer nobody is talking to. That's the bucket PastDue was built for.",
  },
  {
    q: "What access does it need?",
    a: "A Stripe restricted key with read access to subscriptions, invoices and customers, plus permission to create Checkout sessions so your customer gets a working pay link. It cannot create charges, issue refunds, or move money. Revoke it any time in your Stripe dashboard.",
  },
  {
    q: "Do my customers know it isn't me?",
    a: "The emails go out under your name with your reply-to address, and every payment link is a Stripe-hosted page on Stripe's domain. Customers never enter a card anywhere near PastDue.",
  },
  {
    q: "What if someone pays halfway through the sequence?",
    a: "Before every send, PastDue re-checks the subscription in Stripe. If it's healthy again, the sequence stops and the recovery is logged with the amount that came back.",
  },
  {
    q: "I have 40 customers. Is this worth $15?",
    a: "If one $29/mo customer's card dies each month and you save half of them, it pays for itself twice over. If nothing is failing, stay on the free plan — the scan is free forever and will tell you.",
  },
];

function Check({ on }: { on: boolean }) {
  return on ? (
    <svg width="16" height="16" viewBox="0 0 16 16" className="text-good" aria-label="yes">
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" className="text-ink-3/50" aria-label="no">
      <path d="M4 8h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default async function LandingPage() {
  await track("landing_viewed");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur-md">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Logo className="text-[15px]" />
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="#pricing" className="hidden px-3 py-2 text-[14px] text-ink-2 hover:text-ink sm:block">
              Pricing
            </Link>
            <Link href="#how" className="hidden px-3 py-2 text-[14px] text-ink-2 hover:text-ink sm:block">
              How it works
            </Link>
            <ButtonLink href="/login" variant="secondary" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/login" size="sm">
              Scan my Stripe
            </ButtonLink>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pt-14 pb-10 sm:pt-24 sm:pb-14">
          <div className="max-w-3xl">
            <Pill tone="neutral">For solo founders billing through Stripe</Pill>
            <h1 className="display mt-5 text-[38px] font-semibold sm:text-[62px]">
              Stripe retries the card.
              <br />
              <span className="text-ink-3">Nobody retries the customer.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2 sm:text-[19px]">
              After about eight failed attempts, Stripe cancels the subscription and stops emailing. That customer didn&apos;t
              decide to leave — their card expired. PastDue finds every one of them, and wins them back in your voice.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/login" size="lg">
                Scan my Stripe — free
              </ButtonLink>
              <ButtonLink href="#demo" variant="secondary" size="lg">
                Watch it run on a demo account
              </ButtonLink>
            </div>
            <p className="mt-4 text-[13.5px] text-ink-3">
              Read-only restricted key · no card to start · scan is free forever
            </p>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-px bg-line sm:grid-cols-3">
            {[
              { n: "8", l: "failed attempts before Stripe gives up and cancels the subscription" },
              { n: "2–9%", l: "of monthly revenue a typical small SaaS loses to failed cards" },
              { n: "$0", l: "spent by most founders chasing them, because nobody has the list" },
            ].map((s) => (
              <div key={s.n} className="bg-surface px-5 py-7">
                <div className="tnum text-[34px] font-semibold tracking-tight text-ink">{s.n}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{s.l}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:py-24">
          <div className="mb-8 max-w-2xl">
            <p className="eyebrow">See it before you sign up</p>
            <h2 className="display mt-3 text-[30px] font-semibold sm:text-[40px]">This is the whole product.</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
              Below is a real scan against a sample Stripe account, with the real classifier and the real email sequences.
              Nothing is mocked up in a screenshot.
            </p>
          </div>
          <LiveDemo />
        </section>

        <section id="how" className="scroll-mt-20 border-y border-line bg-surface py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="display max-w-2xl text-[30px] font-semibold sm:text-[40px]">Forty seconds to set up. Then it runs without you.</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
              {HOW.map((item) => (
                <div key={item.step} className="bg-surface p-6">
                  <div className="tnum text-[13px] font-semibold text-ink-3">{item.step}</div>
                  <h3 className="mt-3 text-[16px] font-semibold tracking-tight text-ink">{item.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">The honest comparison</p>
            <h2 className="display mt-3 text-[30px] font-semibold sm:text-[40px]">Where Stripe stops</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
              Stripe&apos;s recovery tools are good, and PastDue doesn&apos;t replace them. It picks up at the point Stripe
              considers the customer gone.
            </p>
          </div>

          <Card className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-line text-[12px] tracking-wide text-ink-3 uppercase">
                  <th className="px-4 py-3 font-semibold">&nbsp;</th>
                  <th className="w-24 px-4 py-3 text-center font-semibold">Stripe</th>
                  <th className="w-24 px-4 py-3 text-center font-semibold">PastDue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {COMPARISON.map((r) => (
                  <tr key={r.row}>
                    <td className="px-4 py-3">
                      <div className="text-ink">{r.row}</div>
                      {r.note ? <div className="mt-0.5 text-[12.5px] text-ink-3">{r.note}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <Check on={r.stripe} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <Check on={r.us} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section id="pricing" className="scroll-mt-20 border-y border-line bg-surface py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="max-w-2xl">
              <p className="eyebrow">Pricing</p>
              <h2 className="display mt-3 text-[30px] font-semibold sm:text-[40px]">A flat fee. Never a cut of your recovery.</h2>
              <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
                The tools built for bigger companies charge $249/month or 20–25% of everything they win back. If PastDue
                recovers $1,400 for you this month, you still pay {`$${PLANS.standard.priceMonthly}`}.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {Object.values(PLANS).map((plan) => {
                const featured = plan.id === "standard";
                return (
                  <Card key={plan.id} className={`flex flex-col p-6 ${featured ? "border-ink ring-1 ring-ink" : ""}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-[15px] font-semibold tracking-tight text-ink">{plan.name}</h3>
                      {featured ? <Pill tone="good">Most founders</Pill> : null}
                    </div>
                    <div className="tnum mt-4 flex items-baseline gap-1">
                      <span className="text-[34px] font-semibold tracking-tight text-ink">${plan.priceMonthly}</span>
                      <span className="text-[14px] text-ink-3">/month</span>
                    </div>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{plan.blurb}</p>
                    <ul className="mt-5 flex-1 space-y-2.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                          <span className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-ink-3" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <ButtonLink href="/login" variant={featured ? "primary" : "secondary"} className="mt-6 w-full">
                      {plan.id === "free" ? "Start free" : `Start with ${plan.name}`}
                    </ButtonLink>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
          <h2 className="display text-[30px] font-semibold sm:text-[40px]">Questions worth asking</h2>
          <div className="mt-8 divide-y divide-line border-t border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[15.5px] font-medium text-ink">
                  {item.q}
                  <span className="mt-1 shrink-0 text-ink-3 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-3xl px-5 py-16 text-center sm:py-24">
            <h2 className="display text-[30px] font-semibold sm:text-[42px]">Find out what you&apos;re losing.</h2>
            <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-ink-2">
              The scan is free and takes under a minute. If it finds nothing, you&apos;ve lost a minute and gained an answer.
            </p>
            <ButtonLink href="/login" size="lg" className="mt-7">
              Scan my Stripe account
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <Logo className="text-[14px] text-ink-2" />
          <p>Not affiliated with Stripe. Stripe is a trademark of Stripe, Inc.</p>
        </div>
      </footer>
    </div>
  );
}
