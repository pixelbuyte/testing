import { createHash, randomBytes, randomInt, webcrypto } from "node:crypto";
import { env } from "./env";

const subtle = webcrypto.subtle;

async function key() {
  const raw = createHash("sha256").update(env.appSecret).digest();
  return subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(plain: string): Promise<string> {
  const iv = randomBytes(12);
  const k = await key();
  const buf = await subtle.encrypt({ name: "AES-GCM", iv }, k, Buffer.from(plain, "utf8"));
  return `${iv.toString("base64url")}.${Buffer.from(buf).toString("base64url")}`;
}

export async function decrypt(token: string): Promise<string> {
  const [ivB64, dataB64] = token.split(".");
  const k = await key();
  const buf = await subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(ivB64, "base64url") },
    k,
    Buffer.from(dataB64, "base64url"),
  );
  return Buffer.from(buf).toString("utf8");
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function randomId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export function sixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
