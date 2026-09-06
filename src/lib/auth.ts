import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { env } from "./env";
import { randomId, sha256, sixDigitCode } from "./crypto";

export const SESSION_COOKIE = "pd_session";
const SESSION_DAYS = 30;
const CODE_TTL_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;

function sign(payload: string) {
  return createHmac("sha256", env.appSecret).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: now + SESSION_DAYS * 86_400_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; exp?: number };
    if (!data.uid || !data.exp || data.exp < now) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * A Secure cookie is dropped by browsers over plain HTTP, which would silently
 * break a production build served on localhost. Derive it from the real app URL.
 */
export function secureCookieRequired(appUrl = env.appUrl, isProd = env.isProd) {
  if (appUrl.startsWith("https://")) return true;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(appUrl);
  return isProd && !local;
}

export async function setSessionCookie(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookieRequired(),
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function currentUser() {
  const store = await cookies();
  const userId = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return user ?? null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function issueLoginCode(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const code = sixDigitCode();
  const db = await getDb();
  await db.insert(schema.loginCodes).values({
    id: randomId("lc"),
    email,
    codeHash: sha256(`${email}:${code}`),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  });
  return { email, code };
}

export async function redeemLoginCode(rawEmail: string, rawCode: string) {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();
  const db = await getDb();
  const rows = await db.select().from(schema.loginCodes).where(eq(schema.loginCodes.email, email));
  const now = Date.now();
  const candidate = rows
    .filter((r) => !r.consumedAt && r.expiresAt.getTime() > now && r.attempts < MAX_CODE_ATTEMPTS)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (!candidate) return { ok: false as const, reason: "That code has expired. Request a new one." };

  if (candidate.codeHash !== sha256(`${email}:${code}`)) {
    await db.update(schema.loginCodes).set({ attempts: candidate.attempts + 1 }).where(eq(schema.loginCodes.id, candidate.id));
    return { ok: false as const, reason: "That code isn't right." };
  }

  await db.update(schema.loginCodes).set({ consumedAt: new Date() }).where(eq(schema.loginCodes.id, candidate.id));

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) {
    await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, existing.id));
    return { ok: true as const, user: existing, isNew: false };
  }
  const [created] = await db
    .insert(schema.users)
    .values({ id: randomId("usr"), email, lastLoginAt: new Date() })
    .returning();
  return { ok: true as const, user: created, isNew: true };
}
