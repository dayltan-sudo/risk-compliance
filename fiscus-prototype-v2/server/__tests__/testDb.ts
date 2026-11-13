// In-process Postgres (PGlite) with the real drizzle migrations applied, so
// route tests exercise real SQL without ever touching the shared Neon DB.
// Route tests swap it in with:
//   vi.mock("../db/client.js", async () => ({ db: (await import("./testDb.js")).db }));
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

export const db = drizzle(new PGlite(), { schema });

let migrated: Promise<void> | undefined;
export function ensureMigrated() {
  migrated ??= migrate(db, { migrationsFolder: "./drizzle" });
  return migrated;
}

export async function resetDb() {
  await ensureMigrated();
  const tables = Object.values(schema)
    .filter((v) => typeof v === "object" && v !== null && Symbol.for("drizzle:Name") in v)
    .map((t) => (t as unknown as Record<symbol, string>)[Symbol.for("drizzle:Name")]);
  await db.execute(sql.raw(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`));
}
