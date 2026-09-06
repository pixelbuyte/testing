import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { encrypt, randomId } from "@/lib/crypto";
import { isDemoKey, keyLast4, sourceFor, StripePermissionError, validateKeyShape } from "@/lib/stripe";
import { draftSequences } from "@/lib/ai/draft";
import { syncConnection } from "@/lib/engine";
import { planOf } from "@/lib/plan";
import { track } from "@/lib/analytics";
import type { Tone } from "@/lib/recovery/templates";

const Body = z.object({
  key: z.string().min(3).max(200),
  productName: z.string().max(80).optional(),
  founderName: z.string().max(80).optional(),
  replyTo: z.string().email().optional().or(z.literal("")),
  tone: z.enum(["friendly", "direct", "formal"]).optional(),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste your Stripe restricted key." }, { status: 400 });

  const key = parsed.data.key.trim();
  const shape = validateKeyShape(key);
  if (!shape.ok) return NextResponse.json({ error: shape.reason }, { status: 400 });

  const db = await getDb();
  const existing = await db.select().from(schema.connections).where(eq(schema.connections.userId, user.id));
  const limit = planOf(user.plan).connections;
  if (existing.length >= limit) {
    return NextResponse.json({ error: `Your plan connects ${limit} Stripe account${limit === 1 ? "" : "s"}.` }, { status: 402 });
  }

  const source = sourceFor(key);
  let account;
  try {
    account = await source.verify();
  } catch (e) {
    if (e instanceof StripePermissionError) return NextResponse.json({ error: e.message, missing: e.missing }, { status: 400 });
    return NextResponse.json({ error: "Stripe rejected that key. Check that it's a restricted key from the same account." }, { status: 400 });
  }

  const productName = parsed.data.productName?.trim() || account.businessName;
  const tone = (parsed.data.tone ?? "friendly") as Tone;
  const draft = await draftSequences({ productName, founderName: parsed.data.founderName ?? "", tone });

  const [connection] = await db
    .insert(schema.connections)
    .values({
      id: randomId("conn"),
      userId: user.id,
      stripeAccountId: account.accountId,
      businessName: account.businessName,
      livemode: account.livemode,
      keyCiphertext: await encrypt(key),
      keyLast4: keyLast4(key),
      isDemo: isDemoKey(key),
      permissions: account.permissions,
      productName,
      founderName: parsed.data.founderName ?? "",
      replyTo: parsed.data.replyTo ?? "",
      tone,
      sequences: draft.sequences,
      sequencesSource: draft.source,
    })
    .returning();

  const result = await syncConnection(connection);
  await track("key_connected", { livemode: account.livemode, isDemo: isDemoKey(key), sequencesSource: draft.source }, user.id);
  await track("scan_completed", { recoverableCents: result.totals.recoverableCents, atRisk: result.atRisk.length, lost: result.lost.length }, user.id);

  return NextResponse.json({ ok: true, connectionId: connection.id, scan: result });
}
