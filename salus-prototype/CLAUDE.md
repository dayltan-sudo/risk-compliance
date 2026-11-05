# Salus prototype (Group insurance monitoring demo)

Synthetic-data prototype, NOT a system of record. Root `/home/dayltan/AGENTS.md` and the parent
`/home/dayltan/risk-compliance/CLAUDE.md` also apply. Repo root is this directory; the git
toplevel is `/home/dayltan/risk-compliance` (git dir is one level up, branch `salus-hardening`).

## Environment
- Raspberry Pi CM4, arm64, 4 cores, ~3.7 GB RAM, Debian 13.6. Headless; no browser, no Docker, no psql.
- Node v26.8.1 at `/home/dayltan/.local/bin/node`, npm 11.19.0. python3 3.13.5 exists but this repo does not use it.
- Dependencies are already installed at `./node_modules` (Node 26 runs `.ts` natively; `tsx` is vendored for the API).
- Never export a fake `PATH`: `node` and `./node_modules/...` are enough from the repo root.

## Commands (run from this directory, after `cd /home/dayltan/risk-compliance/salus-prototype`)
- Typecheck: `node ./node_modules/typescript/bin/tsc --noEmit` (clean, exit 0)
- Tests: `node ./node_modules/vitest/vitest.mjs run` (37 files, 471 passed, 1 expected fail, ~31 s)
- One test file: `node ./node_modules/vitest/vitest.mjs run tests/ratios.test.ts`
- Build: `node ./node_modules/vite/bin/vite.js build` (writes `dist/`, gitignored, ~2.6 s)
- Preview the built app: `node ./node_modules/vite/bin/vite.js preview --port 4799` (4173 is often taken)
- Dev server: `node ./node_modules/vite/bin/vite.js --port 5188`, then open `http://localhost:5188/`
- API dev server: `node ./node_modules/tsx/dist/cli.mjs server/dev.ts` (needs 8787 free; see Gotchas)
- `npm test` / `npm run build` / `npm run dev` work too, but the `node ./node_modules/...` forms never wait on npm.
- There is no lint step and no ESLint config. Typecheck plus tests are the whole gate. Do not add a linter.

## Layout
- `src/engine/` pure calculation: ratios, requirements, scoring, summary, dates, fx. No I/O, no React. Test-first lives here.
- `src/data/` synthetic seed portfolio (`portfolio.ts`), posted-record overlay (`overlay.ts`), deterministic PRNG.
- `src/app/` shell and screens: `App.tsx`, `routes.tsx`, `layout/`, `components/`, `ui/`, `map/`, `pages/` (Overview, Coverage, Hotspots, Contracts, Exclusions, Documents, Renewals, Audit, GlobalMap).
- `src/ingestion/` upload text extraction (`fileText.ts`), label rules (`rules.ts`), contract, validation queue, fixtures client.
- `src/assistant/` tool-calling loop and the citation guard (`run.ts`, `tools.ts`, `prompt.ts`).
- `src/audit/` append-only store. `server/` Hono routes + middleware (scope, body limits, audit scope); `api/index.ts` is the Vercel entry. `scripts/` audit/seed/vercel-entry checks. `tests/` vitest suite. `fixtures/` synthetic broker documents.
- `docs/planning/Salus_Prototype_Build_Plan.pdf` is the phase plan. `docs/` is gitignored: the repo is public, the plan is not.

## Hard rules
- Do not run `npm install`, `npm ci` or `pip install`. If a package is missing, say which one and stop.
- Never touch `.env*`, `.gitignore` or `.npmrc`. Never print or copy a secret. Key names only; values come from the environment.
- Never commit or push. Leave changes uncommitted for review, one logical change at a time.
- Synthetic data only. Never real Keppel, client, carrier or policy data, and never a call to a Keppel system. New fixtures are invented.
- Figures shown to a user must be tool-backed and cited; the citation guard in `src/assistant/` refuses uncited numbers. Do not weaken it to make a test pass.
- Scope rules are security behaviour, not UI: a scoped role gets 403, not group figures. Do not relax a scope test.

## Gotchas (observed, not guessed)
- `vite` binds `[::1]` only, so `curl 127.0.0.1:5173` fails with HTTP 000 while `http://localhost:5173/` returns 200. Check with `localhost`.
- Ports 8787 and 4173 are frequently held by leftover servers from earlier runs. Starting `server/dev.ts` then dies with `Error: listen EADDRINUSE: address already in use :::8787`. Check `ss -ltn | grep 8787` and pick another port (or ask before killing anything).
- The dev server logs `Re-optimizing dependencies because lockfile has changed` on the first start; the first request can be slow while it bundles. Wait, then reload.
- `tsc` is 6.0 with `strict` + `noUncheckedIndexedAccess`; array indexing returns `T | undefined`. That is the most common typecheck failure here.
- Build prints `Some chunks are larger than 500 kB after minification` (single 527 kB bundle). Expected, not a regression.
- README claims 385 tests; the real suite is 471 (README drift, not a bug to fix in passing).
- README refers to `.env.example`, which does not exist. The `.env*` files present are zero-byte placeholders; read nothing from them.
- `drizzle.config.ts` and the `db:*` scripts are wired but unused: the prototype runs on the in-memory seed. Do not "fix" persistence.
- The parent `../CLAUDE.md` still says Salus lives under `insurance-dashboard/`. That is the old planning folder; code lives here.
- The legacy stub `/home/dayltan/salus-prototype` contains only a `.vite` cache. Ignore it; do not build there.
