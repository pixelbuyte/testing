import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { syncConnection } from "@/lib/engine";
import { track } from "@/lib/analytics";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = await getDb();
  const [connection] = await db.select().from(schema.connections).where(eq(schema.connections.userId, user.id)).limit(1);
  if (!connection) return NextResponse.json({ error: "Connect Stripe first." }, { status: 400 });

  try {
    const result = await syncConnection(connection);
    await track("scan_completed", { recoverableCents: result.totals.recoverableCents }, user.id);
    return NextResponse.json({ ok: true, scan: result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe didn't respond. Try again." }, { status: 502 });
  }
}
