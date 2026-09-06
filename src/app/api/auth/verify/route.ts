import { NextResponse } from "next/server";
import { z } from "zod";
import { redeemLoginCode, setSessionCookie } from "@/lib/auth";
import { track } from "@/lib/analytics";

const Body = z.object({ email: z.string().email(), code: z.string().min(4).max(10) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });

  const result = await redeemLoginCode(parsed.data.email, parsed.data.code);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 401 });

  await setSessionCookie(result.user.id);
  await track("login_completed", { isNew: result.isNew }, result.user.id);
  return NextResponse.json({ ok: true, isNew: result.isNew });
}
