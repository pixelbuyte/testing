import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { env } from "../env";
import { DDL } from "./ddl";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzlePglite<typeof schema>> | ReturnType<typeof drizzlePostgres<typeof schema>>;

/**
 * Next bundles server code into several chunks, so a module-level variable can be
 * instantiated more than once in one process. PGlite is an embedded single-writer
 * database: two instances over the same directory each keep their own state and
 * silently stop seeing each other's writes. Pin the handle to the process instead.
 */
const GLOBAL_KEY = Symbol.for("pastdue.db");
type GlobalWithDb = typeof globalThis & { [GLOBAL_KEY]?: Promise<Db> | null };
const globalRef = globalThis as GlobalWithDb;

async function create(): Promise<Db> {
  if (env.databaseUrl) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(env.databaseUrl, { max: 5, prepare: false });
    const db = drizzlePostgres(sql, { schema });
    await sql.unsafe(DDL);
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { mkdirSync } = await import("node:fs");
  // PGlite won't create intermediate directories for its data dir.
  mkdirSync(env.pgliteDir, { recursive: true });
  const client = new PGlite(env.pgliteDir);
  const db = drizzlePglite(client, { schema });
  await client.exec(DDL);
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalRef[GLOBAL_KEY]) globalRef[GLOBAL_KEY] = create();
  return globalRef[GLOBAL_KEY];
}

/** Test hook: drop the memoized connection so a fresh one is built. */
export function resetDb() {
  globalRef[GLOBAL_KEY] = null;
}

export { schema };
