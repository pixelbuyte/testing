/**
 * Drives the whole new-user journey in a real browser against a running dev server.
 * Usage: node scripts/journey.mjs [baseUrl]
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const TEST_EMAIL = `founder+${Date.now()}@example.com`;
const CRON_SECRET = process.env.CRON_SECRET ?? "journey-cron-secret";
// Statuses this script deliberately provokes while testing error handling.
const EXPECTED_STATUSES = /status of (400|401|402|502)/;
const EXECUTABLE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SHOTS = "/tmp/pastdue-shots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });

async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`${page.url()} :: ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()} :: ${e.message}`));
  return { context, page };
}

// ---------- 1. Landing page, desktop ----------
{
  const { context, page } = await newPage({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const h1 = await page.locator("h1").first().innerText();
  check("landing renders the headline", h1.includes("Stripe retries the card"), h1.replace(/\n/g, " "));
  check("landing shows pricing", (await page.locator("#pricing").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/01-landing.png`, fullPage: false });

  // ---------- 2. Live demo = the magic moment ----------
  await page.locator("text=Scan the demo account").click();
  await page.waitForSelector("text=Unpaid right now", { timeout: 20_000 });
  const unpaid = await page.locator("text=Unpaid right now").locator("xpath=following-sibling::div[1]").innerText();
  const unpaidCents = Number(unpaid.replace(/[^0-9.]/g, ""));
  check("demo scan finds real money at risk", unpaidCents > 100, `unpaid now ${unpaid}`);
  const lost = await page.locator("text=Already lost").count();
  check("demo surfaces the already-lost bucket", lost > 0);
  await page.screenshot({ path: `${SHOTS}/02-demo-results.png`, fullPage: false });

  await page.locator("button:has-text('See emails')").first().click();
  await page.waitForSelector("text=What gets sent, and when");
  const bodyText = await page.locator("text=What gets sent, and when").locator("xpath=..").innerText();
  check("email previews render with no unfilled variables", !/\{\w+\}/.test(bodyText));
  check("email previews include a schedule", bodyText.includes("Immediately") && /Day \d+/.test(bodyText));
  check("row copy is grammatical", !/\b1 (attempts|days|months)\b/.test(await page.locator("body").innerText()));
  await page.locator("text=What gets sent, and when").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/03-email-preview.png`, fullPage: false });
  await context.close();
}

// ---------- 3. Mobile landing ----------
{
  const { context, page } = await newPage({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("landing has no horizontal overflow on mobile", overflow <= 1, `${overflow}px`);
  await page.screenshot({ path: `${SHOTS}/04-mobile-landing.png`, fullPage: false });
  await context.close();
}

// ---------- 4. Auth: bad code, then real code ----------
const { context, page } = await newPage({ width: 1280, height: 900 });
{
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("unauthenticated /app redirects to login", page.url().includes("/login"), page.url());

  await page.fill("input[type=email]", TEST_EMAIL);
  await page.locator("button:has-text('Email me a code')").click();
  await page.waitForSelector("text=Six-digit code");
  const notice = await page.locator("text=No email provider is configured").innerText();
  const code = notice.match(/(\d{6})/)?.[1];
  check("login code is issued", Boolean(code));

  await page.fill("input[inputmode=numeric]", "000000");
  await page.locator("button:has-text('Sign in')").click();
  await page.waitForSelector("text=/isn't right|expired/", { timeout: 10_000 });
  check("a wrong code is rejected with a readable message", true);

  await page.fill("input[inputmode=numeric]", code);
  await page.locator("button:has-text('Sign in')").click();
  await page.waitForURL("**/app", { timeout: 20_000 });
  check("correct code signs the user in", page.url().endsWith("/app"));
}

// ---------- 5. Empty state: connect Stripe ----------
{
  await page.waitForSelector("text=Connect Stripe, read-only.");
  check("new account sees the connect screen", true);
  check("connect screen lists required permissions", (await page.locator("text=Checkout Sessions").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/05-connect.png`, fullPage: false });

  // Bad key is rejected client-side by the API, not by a crash.
  await page.fill("input[placeholder='rk_live_…']", "pk_live_notarestrictedkey");
  await page.locator("button:has-text('Connect and scan')").click();
  await page.waitForSelector("text=publishable key", { timeout: 15_000 });
  check("a publishable key is rejected with a specific message", true);

  await page.fill("input[placeholder='rk_live_…']", "demo");
  await page.fill("input[placeholder='Acme Analytics']", "Northwind");
  await page.fill("input[placeholder='Sam']", "Robin");
  await page.locator("button:has-text('Connect and scan')").click();
  await page.waitForSelector("text=Unpaid now", { timeout: 40_000 });
  check("connecting runs a scan and lands on the dashboard", true);
  await page.screenshot({ path: `${SHOTS}/06-dashboard.png`, fullPage: false });
}

// ---------- 6. Free plan: start sequences up to the cap ----------
{
  const startButtons = () => page.locator("button:has-text('Start chasing')");
  for (let i = 0; i < 3; i += 1) {
    await startButtons().first().click();
    await page.waitForSelector("text=Chasing · step 1", { timeout: 20_000 });
    await page.waitForTimeout(600);
  }
  const chasing = await page.locator("text=/Chasing · step/").count();
  check("free user can start sequences", chasing >= 1, `${chasing} chasing`);

  await startButtons().first().click();
  await page.waitForSelector("text=/free plan runs/", { timeout: 20_000 });
  check("free plan cap blocks the fourth sequence with an upgrade prompt", true);
  await page.screenshot({ path: `${SHOTS}/07-plan-limit.png`, fullPage: false });

  await page.locator("button:has-text('Pause')").first().click();
  await page.waitForSelector("text=Paused", { timeout: 20_000 });
  check("a running sequence can be paused", true);
}

// ---------- 7. Settings ----------
{
  await page.goto(`${BASE}/app/settings`, { waitUntil: "networkidle" });
  check("settings page loads", (await page.locator("h1:has-text('Settings')").count()) === 1);
  check("settings shows deployment capabilities", (await page.locator("text=Outbox only").count()) > 0);
  await page.locator("button:has-text('Direct')").click();
  await page.locator("button:has-text('Save')").first().click();
  await page.waitForSelector("text=Saved.", { timeout: 25_000 });
  check("changing tone saves and rewrites sequences", true);
  await page.screenshot({ path: `${SHOTS}/08-settings.png`, fullPage: false });

  const autoSend = page.locator("button:has-text('Turn on')");
  check("auto-send is gated on the free plan", await autoSend.first().isDisabled());
}

// ---------- 8. Cron: send due emails, then detect recovery ----------
{
  const unauthorized = await page.evaluate(async (base) => (await fetch(`${base}/api/cron`, { method: "POST" })).status, BASE);
  check("cron refuses an unauthenticated call", unauthorized === 401, `status ${unauthorized}`);

  const cron = await page.evaluate(
    async ([base, secret]) => {
      const r = await fetch(`${base}/api/cron`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
      return { status: r.status, body: await r.json() };
    },
    [BASE, CRON_SECRET],
  );
  check("cron endpoint runs when authorized", cron.status === 200, JSON.stringify(cron.body));
  check("cron sent the due first steps", (cron.body.sent ?? 0) > 0, `${cron.body.sent} sent`);

  const outbox = await page.evaluate(async (base) => {
    const r = await fetch(`${base}/api/outbox`);
    return r.json();
  }, BASE);
  check("emails landed in the outbox", (outbox.emails?.length ?? 0) > 0, `${outbox.emails?.length} emails`);
  const first = outbox.emails?.[0];
  check("outbound email is fully rendered", Boolean(first) && !/\{\w+\}/.test(`${first.subject} ${first.text}`), first?.subject);
  const founderEmail = outbox.emails?.find((e) => e.from.includes("Robin"));
  check("outbound email is signed by the founder", Boolean(founderEmail), founderEmail?.from);
}

// ---------- 9. Mobile dashboard ----------
{
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("dashboard has no horizontal overflow on mobile", overflow <= 1, `${overflow}px`);
  await page.screenshot({ path: `${SHOTS}/09-mobile-dashboard.png`, fullPage: false });
  await page.setViewportSize({ width: 1280, height: 900 });
}

// ---------- 10. API error handling ----------
{
  await page.route("**/api/scan", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Stripe didn't respond. Try again." }) }));
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("button:has-text('Rescan')").click();
  await page.waitForSelector("text=Stripe didn't respond", { timeout: 15_000 });
  check("a failing API shows an error instead of breaking the page", true);
  await page.screenshot({ path: `${SHOTS}/10-api-error.png`, fullPage: false });
  await page.unroute("**/api/scan");

  await page.route("**/api/demo", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator("text=Scan the demo account").click();
  await page.waitForSelector("text=Reading subscriptions…", { timeout: 5000 });
  check("a slow API shows progress rather than a dead button", true);
  await page.waitForSelector("text=Unpaid right now", { timeout: 30_000 });
  check("a slow API still completes", true);
  await page.unroute("**/api/demo");
}

// ---------- 11. Sign out ----------
{
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("button:has-text('Sign out')").click();
  await page.waitForURL(BASE + "/", { timeout: 15_000 });
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("signing out ends the session", page.url().includes("/login"));
}

await context.close();
await browser.close();

const failed = results.filter((r) => !r.passed);
const realErrors = consoleErrors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e) && !EXPECTED_STATUSES.test(e));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (realErrors.length) {
  console.log(`\nConsole errors (${realErrors.length}):`);
  for (const e of realErrors.slice(0, 10)) console.log(`  ${e}`);
}
console.log(`Screenshots in ${SHOTS}`);
process.exit(failed.length || realErrors.length ? 1 : 0);
