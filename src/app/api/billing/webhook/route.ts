import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { track } from "@/lib/analytics";

export const dynamic = "force-dynamic";

async function setPlan(userId: string, plan: string, planStatus: string, subscriptionId?: string | null) {
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ plan, planStatus, ...(subscriptionId !== undefined ? { billingSubscriptionId: subscriptionId } : {}) })
    .where(eq(schema.users.id, userId));
}

async function userIdFor(stripe: Stripe, customerId: string | null, metadataUserId?: string | null) {
  if (metadataUserId) return metadataUserId;
  if (!customerId) return null;
  const db = await getDb();
  const [byCustomer] = await db.select().from(schema.users).where(eq(schema.users.billingCustomerId, customerId)).limit(1);
  if (byCustomer) return byCustomer.id;
  const customer = await stripe.customers.retrieve(customerId).catch(() => null);
  if (customer && !customer.deleted) return (customer.metadata?.userId as string | undefined) ?? null;
  return null;
}

export async function POST(request: Request) {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) {
    return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });
  }

  const stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2026-08-26.dahlia" });
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature ?? "", env.stripeWebhookSecret);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bad signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = await userIdFor(stripe, typeof session.customer === "string" ? session.customer : null, session.metadata?.userId ?? session.client_reference_id);
      const plan = session.metadata?.plan ?? "standard";
      if (userId) {
        await setPlan(userId, plan, "active", typeof session.subscription === "string" ? session.subscription : null);
        await track("plan_activated", { plan }, userId);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = await userIdFor(stripe, typeof sub.customer === "string" ? sub.customer : null, sub.metadata?.userId);
      if (!userId) break;
      const gone = event.type === "customer.subscription.deleted" || sub.status === "canceled" || sub.status === "unpaid";
      if (gone) {
        await setPlan(userId, "free", "canceled", null);
        await track("plan_canceled", { reason: sub.status }, userId);
      } else {
        await setPlan(userId, sub.metadata?.plan ?? "standard", sub.status);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
