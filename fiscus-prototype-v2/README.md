# Fiscus (prototype v2)

Credit-assessment app: upload financial statements, LLM extracts fields, reviewer confirms, deterministic scorecard rates, LLM writes risk commentary, approval workflow.

Live: https://fiscus-dayl.vercel.app

## Stack
- Frontend: Vite, React, TypeScript, Tailwind, Zustand (client cache only)
- API: Hono in `server/`, single Vercel Node function via `api/index.ts`
- DB: Neon Postgres via Drizzle (`server/db/schema.ts`, migrations in `drizzle/`)
- Files: Vercel Blob (store `fiscus-documents`)
- LLM: OpenAI-compatible endpoint (`server/lib/llm.ts`); two surfaces only: `server/lib/extraction.ts`, `server/lib/riskCommentaryLLM.ts`
- Scoring: pure functions in `src/engine/` (ratios, rating, integrity checks), covered by vitest

## Run locally
```bash
npm install
npx vercel env pull .env.local
npm run dev:all
```
Web on :5173, API on :8787 (proxied). Log in with `APP_PASSWORD`.

Local dev and production share one database. Test data you create locally appears in production.

## Commands
- `npm test` — vitest
- `npx tsc -b` — typecheck
- `npm run db:generate` / `npm run db:migrate` — schema changes

## Env vars (set in Vercel, never commit)
`DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `BLOB_STORE_ID`. Template: `.env.example`.

## Deploy
Vercel project `fiscus-prototype-v2`, Root Directory `fiscus-prototype-v2`. Merge to `main` deploys to production. Work on a branch, open a PR.
