import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { runDueSends, startSequence, syncConnection } from "@/lib/engine";
import { planOf } from "@/lib/plan";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  if (!env.cronSecret) return env.allowDevTools;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Hourly job: rescan every connection, auto-start sequences where the founder
 * opted in, then send everything that's due.
 */
async function run() {
  const db = await getDb();
  const connections = await db.select().from(schema.connections);
  let scanned = 0;
  let autoStarted = 0;

  for (const connection of connections) {
    try {
      await syncConnection(connection);
      scanned += 1;
    } catch {
      continue;
    }
    if (!connection.autoSend) continue;

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, connection.userId)).limit(1);
    if (!user || !planOf(user.plan).autoSend) continue;

    const drafts = await db.select().from(schema.recoveries).where(eq(schema.recoveries.connectionId, connection.id));
    for (const recovery of drafts.filter((r) => r.status === "draft" && r.customerEmail)) {
      try {
        await startSequence(connection, recovery);
        autoStarted += 1;
      } catch {
        // Skip this one; the next run will retry.
      }
    }
  }

  const sends = await runDueSends();
  return { scanned, autoStarted, ...sends };
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await run()) });
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await run()) });
}
