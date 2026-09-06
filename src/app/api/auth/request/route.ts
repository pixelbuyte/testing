import { NextResponse } from "next/server";
import { z } from "zod";
import { issueLoginCode } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { track } from "@/lib/analytics";

const Body = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const { email, code } = await issueLoginCode(parsed.data.email);
  const result = await sendEmail({
    to: email,
    from: env.emailFrom,
    subject: `${code} is your PastDue sign-in code`,
    text: `Your sign-in code is ${code}.\n\nIt expires in 15 minutes. If you didn't ask for it, you can ignore this email.`,
  });
  await track("login_code_requested", { delivery: result.status });

  // With no email provider configured the code is surfaced in the response so the
  // app is usable out of the box. Never do this once RESEND_API_KEY is set.
  const devCode = result.status === "outbox" ? code : undefined;
  return NextResponse.json({ ok: true, delivery: result.status, devCode });
}
