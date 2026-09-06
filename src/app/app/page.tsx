import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { loadDashboard, renderStep } from "@/lib/engine";
import { STEP_SCHEDULE } from "@/lib/recovery/sequence";
import type { AtRiskCustomer, Bucket } from "@/lib/recovery/scan";
import { planOf } from "@/lib/plan";
import { capabilities } from "@/lib/env";
import { ConnectStripe } from "@/components/connect-stripe";
import { Dashboard } from "@/components/dashboard";
import { AppShell } from "@/components/app-shell";
import type { RecoveryRow } from "@/components/scan-view";

export const dynamic = "force-dynamic";

export default async function AppPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const db = await getDb();
  const [connection] = await db.select().from(schema.connections).where(eq(schema.connections.userId, user.id)).limit(1);

  if (!connection) {
    return (
      <AppShell email={user.email} plan={planOf(user.plan)}>
        <ConnectStripe />
      </AppShell>
    );
  }

  const data = await loadDashboard(connection);
  const rows: RecoveryRow[] = data.recoveries
    .filter((r) => r.status !== "closed")
    .map((r) => ({
      key: r.id,
      recoveryId: r.id,
      status: r.status,
      stepIndex: r.stepIndex,
      customer: r.snapshot as AtRiskCustomer,
      previews: STEP_SCHEDULE[r.bucket as Bucket].map((dayOffset, i) => {
        const rendered = renderStep(connection, r, i);
        return { label: rendered?.label ?? `Step ${i + 1}`, dayOffset, subject: rendered?.subject ?? "", body: rendered?.body ?? "" };
      }),
    }));

  return (
    <AppShell email={user.email} plan={planOf(user.plan)}>
      <Dashboard
        rows={rows}
        scan={data.scan}
        recovered={data.recovered}
        connection={{
          productName: connection.productName,
          founderName: connection.founderName,
          keyLast4: connection.keyLast4,
          livemode: connection.livemode,
          isDemo: connection.isDemo,
          autoSend: connection.autoSend,
          lastScanAt: connection.lastScanAt?.toISOString() ?? null,
          sequencesSource: connection.sequencesSource,
        }}
        plan={planOf(user.plan)}
        emailMode={capabilities().email}
        justUpgraded={params.upgraded === "1"}
      />
    </AppShell>
  );
}
