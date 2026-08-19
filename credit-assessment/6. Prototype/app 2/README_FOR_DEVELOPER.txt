Credit Assessment — Frontend Prototype
=======================================

TO VIEW / RUN IT:
  cd app
  npm install
  npm run dev
  → open the URL Vite prints (typically http://localhost:5173)

  (No pre-built bundle is included in this zip — Gmail blocks .js files as
  attachments, even zipped, so the dist/ build output was left out. It's a
  one-command build: npm run build.)

TO MODIFY IT:
  source lives in src/ — see src/store/useStore.ts for app state/logic,
  src/pages/ and src/components/ for screens, src/engine/ for the ratio/
  rating/recommendation calculations, src/data/ for the mock seed data
  and placeholder methodology config.

WHAT THIS IS:
  A working frontend prototype of the Credit Assessment tool, built against
  Credit_Assessment_PRD_v0.10.md and Credit_Assessment_Agent_Architecture_Plan.html
  (v1.9). Covers all Must/MVP requirements (FR1–FR11). No backend — all data
  is in-memory, seeded on load, and mocked (document extraction, ratio
  formulas, and scorecard weights are all clearly labeled PLACEHOLDER pending
  the client's baseline Excel template).

  Full requirements context is in the "credit-assessment" folder one level up
  from this one (Planning & Prototyping, Agents & Workflows, Testing).
