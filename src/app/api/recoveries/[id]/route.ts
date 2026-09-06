import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { loadDashboard, pauseSequence, renderStep, startSequence } from "@/lib/engine";
import { canStartSequence } from "@/lib/plan";

const Body = z.object({ action: z.enum(["start", "pause", "preview"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const { id } = await context.params;
  const db = await getDb();
  const [recovery] = await db.select().from(schema.recoveries).where(eq(schema.recoveries.id, id)).limit(1);
  if (!recovery) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [connection] = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.id, recovery.connectionId), eq(schema.connections.userId, user.id)))
    .limit(1);
  if (!connection) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (parsed.data.action === "preview") {
    const sequences = [0, 1, 2, 3].map((i) => renderStep(connection, recovery, i)).filter(Boolean);
    return NextResponse.json({ ok: true, steps: sequences });
  }

  if (parsed.data.action === "pause") {
    return NextResponse.json({ ok: true, recovery: await pauseSequence(recovery.id) });
  }

  const { activeCount } = await loadDashboard(connection);
  const allowed = canStartSequence(user.plan, activeCount);
  if (!allowed.ok) return NextResponse.json({ error: allowed.reason, upgrade: true }, { status: 402 });

  try {
    return NextResponse.json({ ok: true, recovery: await startSequence(connection, recovery) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't start that sequence." }, { status: 502 });
  }
}
