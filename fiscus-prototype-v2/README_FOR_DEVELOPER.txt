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

TO RUN THE PARITY TEST SUITE:
  npm test
  Exercises src/engine/ (ratios, rating, integrity checks) against
  Baseline_Scorecard_Extract_v1.2.md's methodology, including its six §7
  corrections, FR4.11/4.12 zero-divisor rules, FR6.5 absent-input handling,
  FR6.13 profitability sign tiering, and the FR6.8 class bands. See the
  header comment in src/engine/__tests__/rating.parity.test.ts for what this
  does and does not prove — the client's source .xlsx isn't in this repo, so
  this is spec parity, not yet literal workbook parity.

WHAT THIS IS:
  A working frontend prototype of the Credit Assessment tool, built against
  Credit_Assessment_PRD_MVP.md (v1.2-MVP) and Baseline_Scorecard_Extract_v1.2.md,
  plus the six agent-design docs under "3. Agents & Workflows/a. Agents/".
  Covers FR1–FR11, including the eleven-criterion scorecard (closed
  methodology, no placeholders), FR3.6/3.7 integrity checks with FR3.13
  discrepancy attribution, FR5's five non-financial criteria, and FR11 Risk
  Commentary. No backend — all data is in-memory and seeded on load. FR11 is
  implemented as a deterministic rule-based stand-in (src/engine/riskCommentary.ts,
  explicitly labelled "prototype-stub-v1" in its own output) rather than a real
  model call, since this prototype makes no network calls anywhere else.

  Full requirements context is in the "credit-assessment" folder one level up
  from this one (Planning & Prototyping, Agents & Workflows, Testing).
