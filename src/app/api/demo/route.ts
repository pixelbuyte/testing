import { NextResponse } from "next/server";
import { buildDemo } from "@/lib/demo";
import { track } from "@/lib/analytics";
import type { Tone } from "@/lib/recovery/templates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tone = (new URL(request.url).searchParams.get("tone") ?? "friendly") as Tone;
  const payload = await buildDemo(["friendly", "direct", "formal"].includes(tone) ? tone : "friendly");
  await track("demo_scan_completed", {
    atRisk: payload.scan.atRisk.length,
    lost: payload.scan.lost.length,
    recoverableCents: payload.scan.totals.recoverableCents,
  });
  return NextResponse.json(payload);
}
