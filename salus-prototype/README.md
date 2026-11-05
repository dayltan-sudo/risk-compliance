# Salus Prototype

A working prototype of **Salus**, the Group insurance monitoring system: consolidated policies,
coverage ratios, third-party contractual requirements, exclusion conflicts, document ingestion and
a cited assistant.

**Synthetic data only. This is a demo, not a system of record.** Every entity, site, carrier and
figure is invented; nothing here comes from a Keppel system.

## Status

All nine phases are built and verified. 385 tests, `tsc --noEmit` clean, `vite build` green.

| Phase | Scope | State |
| :--- | :--- | :--- |
| P0 | Scaffold, guardrails, env | done |
| P1 | Data spine, seed portfolio, ratio and scoring engine | done |
| P2 | Shell, Group Overview, Global Map | done |
| P3 | Coverage Adequacy, Risk Hotspots | done |
| P4 | Contract Requirements, Insurance Exclusions | done |
| P5 | Document ingestion and validation queue | done, real file upload |
| P6 | Salus Assistant (tool-calling, cited answers) | built, needs a model key |
| P7 | Audit log, roles, entity scoping | done |
| P8 | Demo packaging and deployment | deploy pending |

Full plan, claims and phase exit tests: `docs/planning/Salus_Prototype_Build_Plan.pdf`.

## What works end to end

- **Upload → record → ratio.** A PDF, DOCX or text slip is parsed server-side, its labelled fields
  are extracted, doubtful ones are queued for review, and posting the draft moves the portfolio:
  raising Hai Phong Yard from SGD 25m to 80m takes group adequacy from 90.03% to 91.57%.
- **Exclusion override.** A requirement can be numerically satisfied and still `Excluded` when the
  wording removes the peril (Singapore DC-4, ransomware, 133% of the required limit).
- **Scope.** A scoped role sees only its own entities in the summary, the registers, the CSV export
  and the audit trail; the API returns 403 rather than group figures.
- **Cited answers.** The assistant answers only with tool-backed figures; any sentence carrying a
  figure without its own resolvable citation is refused in code, not by prompt.

## Stack

Vite + React 19 + TypeScript + Tailwind 4 + React Router · Hono on Vercel · unpdf and mammoth for
document text · Drizzle schema present but unused (the prototype runs on the in-memory seed).

Two model-backed paths are optional and off by default:

| Variable | Enables |
| :--- | :--- |
| `SALUS_EXTRACTION_BASE_URL`, `_MODEL`, `_API_KEY` | real model extraction of uploads (otherwise deterministic label matching) |
| `SALUS_ASSISTANT_BASE_URL`, `_MODEL`, `_API_KEY` | the assistant (otherwise it reports "not configured") |
| `SESSION_SECRET` | stable session signing across restarts |

Values live in the environment and in the Vercel project settings. Never in this repo.

## Layout

```
src/engine/     pure calculation functions, no I/O
src/data/       synthetic seed portfolio, posted-record overlay
src/app/        screens, layout, filters, assistant dock
src/ingestion/  extraction contract, file parsers, rules extractor, validation queue
src/assistant/  tool loop and citation guard
src/audit/      append-only audit store
server/         hono routes (summary, documents, upload, assistant, audit, export, session)
api/            Vercel entry point
fixtures/       synthetic broker documents (text, DOCX, PDF)
docs/           plan and decks (gitignored: not published)
tests/          vitest
```

## Commands

```bash
export PATH=/home/dayltan/.local/share/node-runtime/bin:$PATH
npm test          # vitest, no database required
npm run typecheck
npm run dev:api   # hono on :8787
npm run dev       # vite on :5173
npm run build
```

## Deploying

Vercel project with **Root Directory `salus-prototype`**, framework Vite, build `npm run build`,
output `dist`. `vercel.json` carries the SPA rewrite and the `/api` function route. Set
`SESSION_SECRET` and the model keys as project environment variables.

## Rules

- No Keppel confidential material in this repo, ever.
- No calls to any Keppel system.
- Never commit `.env`. Key names only in `.env.example`.
