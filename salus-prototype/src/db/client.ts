import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Lazy Postgres client. Nothing connects at import time, so the engine, the
 * seed and the whole test suite run with no database present.
 *
 * P1 never needs this: the API serves from the in-memory seed. Set
 * DATABASE_URL only when actually running against Postgres.
 */

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;

export function getDb(): NodePgDatabase<typeof schema> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL is not set. P1 serves from the in-memory seed; set DATABASE_URL only when running against Postgres.',
    );
  }

  if (pool === undefined) {
    pool = new Pool({ connectionString: url, max: 4 });
    database = drizzle(pool, { schema });
  }

  return database as NodePgDatabase<typeof schema>;
}

export async function closeDb(): Promise<void> {
  if (pool !== undefined) {
    await pool.end();
  }
  pool = undefined;
  database = undefined;
}

export { schema };
