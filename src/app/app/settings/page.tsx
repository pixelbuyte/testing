import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { planOf } from "@/lib/plan";
import { capabilities } from "@/lib/env";
import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";
import { ButtonLink, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const [connection] = await db.select().from(schema.connections).where(eq(schema.connections.userId, user.id)).limit(1);
  const plan = planOf(user.plan);

  if (!connection) {
    return (
      <AppShell email={user.email} plan={plan}>
        <Card className="p-8 text-center">
          <p className="text-[15px] font-medium text-ink">Connect Stripe first.</p>
          <ButtonLink href="/app" className="mt-4">
            Go to setup
          </ButtonLink>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell email={user.email} plan={plan}>
      <SettingsForm
        plan={plan}
        caps={capabilities()}
        connection={{
          productName: connection.productName,
          founderName: connection.founderName,
          replyTo: connection.replyTo,
          tone: connection.tone,
          autoSend: connection.autoSend,
          keyLast4: connection.keyLast4,
          sequencesSource: connection.sequencesSource,
        }}
      />
    </AppShell>
  );
}
