import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { readOutbox } from "@/lib/email";
import { capabilities } from "@/lib/env";

export const dynamic = "force-dynamic";

/** What would have been emailed while no email provider is configured. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, mode: capabilities().email, emails: readOutbox().slice(0, 50) });
}
