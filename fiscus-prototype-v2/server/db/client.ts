import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

// Single pooled connection, reused across warm serverless invocations (a new
// module-scope Pool per cold start is the standard Vercel Node pattern).
// `ssl: true` is explicit rather than relying on `sslmode=require` in the
// connection string — newer pg-connection-string versions treat that mode as
// an alias for verify-full and can otherwise silently fail to negotiate TLS
// against Neon's pooler.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: true });

export const db = drizzle(pool, { schema });
