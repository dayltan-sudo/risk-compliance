import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Owner supplies the real value through DATABASE_URL; drizzle-kit only
    // needs a syntactically valid placeholder to generate SQL offline.
    url: process.env.DATABASE_URL ?? 'postgres://salus:salus@localhost:5432/salus',
  },
});
