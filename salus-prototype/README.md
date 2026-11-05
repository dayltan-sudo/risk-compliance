# Salus Prototype

A working prototype of **Salus**, the Group insurance monitoring system: consolidated policies,
coverage ratios, third-party contractual requirements, exclusion conflicts, and a cited assistant.

**Synthetic data only. This is a demo, not a system of record.** Every entity, site, carrier and
figure is invented; nothing here comes from a Keppel system.

## Status

| Phase | Scope | State |
| :--- | :--- | :--- |
| P0 | Scaffold, guardrails, env | in progress |
| P1 | Data spine, seed portfolio, ratio and scoring engine | in progress |
| P2 | Shell, Group Overview, Global Map | queued |
| P3 | Coverage Adequacy, Risk Hotspots | queued |
| P4 | Contract Requirements, Insurance Exclusions | queued |
| P5 | Document ingestion and validation queue | queued |
| P6 | Salus Assistant (tool-calling, cited answers) | queued |
| P7 | Audit log, roles, config versions | queued |
| P8 | Demo packaging | queued |

Full plan, claims and phase exit tests: `docs/planning/Salus_Prototype_Build_Plan.pdf`.

## Stack

Vite + React 19 + TypeScript + Tailwind 4 + Zustand + React Router · Hono on Vercel ·
Postgres via Drizzle · Vercel Blob · LLM for extraction and the assistant only.

## Layout

```
src/engine/     pure calculation functions, no I/O
src/data/       synthetic seed portfolio
src/db/         drizzle schema
src/app/map/    dot-matrix world map
src/app/ui/     design tokens and shell primitives
src/ingestion/  extraction contract and validation routing
server/         hono routes
api/            Vercel entry
fixtures/       synthetic broker documents
docs/           plan and decks
tests/          vitest
```

## Commands

```bash
export PATH=/home/dayltan/.local/share/node-runtime/bin:$PATH
npm test          # vitest, no database required
npm run typecheck
npm run dev:api   # hono on :8787
npm run dev       # vite on :5173
```

## Rules

- No Keppel confidential material in this repo, ever.
- No calls to any Keppel system.
- Never commit `.env`. Key names only in `.env.example`.
