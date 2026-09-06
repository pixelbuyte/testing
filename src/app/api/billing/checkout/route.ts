import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { track } from "@/lib/analytics";

const Body = z.object({ plan: z.enum(["standard", "pro"]) });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a plan." }, { status: 400 });

  const priceId = parsed.data.plan === "pro" ? env.stripePricePro : env.stripePriceStandard;
  if (!env.stripeSecretKey || !priceId) {
    return NextResponse.json({ error: "Billing isn't configured on this deployment yet.", billingDisabled: true }, { status: 503 });
  }

  const stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2026-08-26.dahlia" });
  const db = await getDb();

  let customerId = user.billingCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
    customerId = customer.id;
    await db.update(schema.users).set({ billingCustomerId: customerId }).where(eq(schema.users.id, user.id));
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.appUrl}/app?upgraded=1`,
    cancel_url: `${env.appUrl}/app?upgrade=cancelled`,
    client_reference_id: user.id,
    metadata: { userId: user.id, plan: parsed.data.plan },
    subscription_data: { metadata: { userId: user.id, plan: parsed.data.plan } },
  });

  await track("checkout_started", { plan: parsed.data.plan }, user.id);
  return NextResponse.json({ ok: true, url: session.url });
}
