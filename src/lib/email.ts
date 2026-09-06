import { env } from "./env";

export interface OutgoingEmail {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
}

export interface SendResult {
  status: "sent" | "outbox" | "failed";
  providerId?: string;
  error?: string;
}

/** Every email that would have gone out while no provider is configured. Visible in the app. */
const outbox: (OutgoingEmail & { at: number })[] = [];

export function readOutbox() {
  return [...outbox].reverse();
}

export function clearOutbox() {
  outbox.length = 0;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  if (!env.resendApiKey) {
    outbox.push({ ...email, at: Date.now() });
    return { status: "outbox" };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: email.from,
      to: email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
    });
    if (error) return { status: "failed", error: error.message };
    return { status: "sent", providerId: data?.id };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "send failed" };
  }
}

export function fromHeader(founderName: string, productName: string) {
  const configured = env.emailFrom;
  const match = configured.match(/<([^>]+)>/);
  const address = match ? match[1] : configured;
  const display = founderName.trim() || productName.trim() || "PastDue";
  return `${display.replace(/["<>]/g, "")} <${address}>`;
}
