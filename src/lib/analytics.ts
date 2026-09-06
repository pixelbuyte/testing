import { getDb, schema } from "./db";
import { randomId } from "./crypto";

export type EventName =
  | "landing_viewed"
  | "demo_started"
  | "demo_scan_completed"
  | "key_connected"
  | "scan_completed"
  | "sequence_previewed"
  | "sequence_started"
  | "sequence_paused"
  | "email_sent"
  | "recovery_detected"
  | "login_code_requested"
  | "login_completed"
  | "checkout_started"
  | "plan_activated"
  | "plan_canceled";

/** Fire-and-forget; analytics must never break a request. */
export async function track(name: EventName, props: Record<string, unknown> = {}, userId?: string | null) {
  try {
    const db = await getDb();
    await db.insert(schema.events).values({ id: randomId("ev"), userId: userId ?? null, name, props });
  } catch {
    // ignore
  }
}
