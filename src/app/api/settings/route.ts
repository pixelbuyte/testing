import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { draftSequences } from "@/lib/ai/draft";
import { planOf } from "@/lib/plan";
import type { Tone } from "@/lib/recovery/templates";

const Body = z.object({
  productName: z.string().min(1).max(80).optional(),
  founderName: z.string().max(80).optional(),
  replyTo: z.string().email().optional().or(z.literal("")),
  tone: z.enum(["friendly", "direct", "formal"]).optional(),
  autoSend: z.boolean().optional(),
  redraft: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Those settings look wrong." }, { status: 400 });

  const db = await getDb();
  const [connection] = await db.select().from(schema.connections).where(eq(schema.connections.userId, user.id)).limit(1);
  if (!connection) return NextResponse.json({ error: "Connect Stripe first." }, { status: 400 });

  const body = parsed.data;
  if (body.autoSend && !planOf(user.plan).autoSend) {
    return NextResponse.json({ error: "Auto-send is part of the Standard plan.", upgrade: true }, { status: 402 });
  }

  const productName = body.productName ?? connection.productName;
  const founderName = body.founderName ?? connection.founderName;
  const tone = (body.tone ?? connection.tone) as Tone;
  const toneChanged = body.tone != null && body.tone !== connection.tone;

  let sequences = connection.sequences;
  let sequencesSource = connection.sequencesSource;
  if (body.redraft || toneChanged) {
    const draft = await draftSequences({ productName, founderName, tone });
    sequences = draft.sequences;
    sequencesSource = draft.source;
  }

  const [updated] = await db
    .update(schema.connections)
    .set({
      productName,
      founderName,
      replyTo: body.replyTo ?? connection.replyTo,
      tone,
      autoSend: body.autoSend ?? connection.autoSend,
      sequences,
      sequencesSource,
    })
    .where(eq(schema.connections.id, connection.id))
    .returning();

  return NextResponse.json({ ok: true, connection: { ...updated, keyCiphertext: undefined } });
}
