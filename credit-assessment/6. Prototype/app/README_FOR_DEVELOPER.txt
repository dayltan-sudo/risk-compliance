Credit Assessment — Frontend Prototype
=======================================

TO VIEW IT (no setup required):
  Double-click "Run Prototype.command"
  → opens a terminal window, starts a local server, and opens your browser
    to the running app. Close the terminal window (or Ctrl+C) to stop it.

TO DEVELOP / MODIFY IT:
  npm install
  npm run dev
  (source lives in src/ — see src/store/useStore.ts for app state/logic,
  src/pages/ and src/components/ for screens, src/engine/ for the ratio/
  rating/recommendation calculations, src/data/ for the mock seed data
  and placeholder methodology config)

WHAT THIS IS:
  A working frontend prototype of the Credit Assessment tool, built against
  Credit_Assessment_PRD_v0.10.md and Credit_Assessment_Agent_Architecture_Plan.html
  (v1.9). Covers all Must/MVP requirements (FR1–FR11). No backend — all data
  is in-memory, seeded on load, and mocked (document extraction, ratio
  formulas, and scorecard weights are all clearly labeled PLACEHOLDER pending
  the client's baseline Excel template).

  Full requirements context is in the "credit-assessment" folder one level up
  from this one (Planning & Prototyping, Agents & Workflows, Testing).
