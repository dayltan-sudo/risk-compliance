import type { CriterionNumberAll, PresentationScale, StandardFieldName, StatementSection } from "../types";

// Baseline_Scorecard_Extract_v1.2.md / Credit_Assessment_PRD_MVP.md FR6.14:
// methodology is code, not runtime config. Bump SCORECARD_VERSION whenever a
// band boundary, weight, or class threshold changes below.
export const SCORECARD_VERSION = "v1.2-MVP";
export const EXTRACTION_MODEL_VERSION = "extract-v1.4.2";

// FR2.6 — code constants, changed by deployment, not read from a runtime config store.
export const CONFIDENCE_THRESHOLDS = { high: 90, medium: 70 };

// FR3.7 — the three equality checks pass within 0.1% of Total Assets.
export const INTEGRITY_TOLERANCE_PCT = 0.001;

// FR3.12 — statement recency flag threshold.
export const RECENCY_THRESHOLD_DAYS = 540;

// FR2.2 — the closed field set. "amount" fields are currency amounts; the one
// "boolean" field is FR2.2's sign test (baseline C33, Net Operating Cash Flow
// Positive, Yes/No).
export const FIELD_DEFS: { name: StandardFieldName; section: StatementSection; valueType: "amount" | "boolean" }[] = [
  { name: "Sales", section: "Income Statement", valueType: "amount" },
  { name: "NPAT", section: "Income Statement", valueType: "amount" },
  { name: "Current Assets", section: "Balance Sheet", valueType: "amount" },
  { name: "Cash and Bank Balances", section: "Balance Sheet", valueType: "amount" },
  { name: "Non-Current Assets", section: "Balance Sheet", valueType: "amount" },
  { name: "Total Assets", section: "Balance Sheet", valueType: "amount" },
  { name: "Current Liabilities", section: "Balance Sheet", valueType: "amount" },
  { name: "Non-Current Liabilities", section: "Balance Sheet", valueType: "amount" },
  { name: "Total Liabilities", section: "Balance Sheet", valueType: "amount" },
  { name: "Total Equity", section: "Balance Sheet", valueType: "amount" },
  { name: "Net Operating Cash Flow Positive", section: "Cash Flow", valueType: "boolean" },
];

interface IntervalBand {
  kind: "interval";
  // Higher-is-better, unbounded top: tier 3 when x >= tier3Min, tier 2 when
  // tier2Min <= x < tier3Min, tier 1 when x < tier2Min. Covers criteria 1, 2,
  // 3, 5, 7 — all of FR6.7's interval criteria except 4.
  tier3Min: number;
  tier2Min: number;
  displayHint: "pct" | "x" | "years";
}

interface DebtToEquityBand {
  // Criterion 4 alone: lower-is-better with a floor, not the higher-is-better
  // unbounded shape above. Tier 3: 0 < x <= 1. Tier 2: 1 < x < 2. Tier 1:
  // x >= 2 or x <= 0 (the x<=0 branch is FR6.10's "negative equity" route;
  // the TE=0 zero-divisor route is resolved upstream in ratios.ts and read
  // directly by rating.ts, never re-banded here).
  kind: "debt_to_equity";
  tier3Max: 1;
  tier2Max: 2;
  displayHint: "x";
}

interface CategoricalBand {
  kind: "categorical";
  binary: boolean; // criteria 8, 9, 10 — no tier 2
}

export interface CriterionDef {
  number: CriterionNumberAll;
  label: string;
  band: IntervalBand | DebtToEquityBand | CategoricalBand;
  weightNew: number;
  weightRenewal: number;
}

// FR6.7 — the full scorecard table. Weights sum to 100 in both columns.
export const SCORECARD: Record<CriterionNumberAll, CriterionDef> = {
  1: { number: 1, label: "WC over revenue", band: { kind: "interval", tier3Min: 0.2, tier2Min: 0, displayHint: "pct" }, weightNew: 5, weightRenewal: 5 },
  2: { number: 2, label: "Current ratio", band: { kind: "interval", tier3Min: 3, tier2Min: 2, displayHint: "x" }, weightNew: 10, weightRenewal: 10 },
  3: { number: 3, label: "Net profit margin", band: { kind: "interval", tier3Min: 0.3, tier2Min: 0, displayHint: "pct" }, weightNew: 10, weightRenewal: 10 },
  4: { number: 4, label: "Debt to equity", band: { kind: "debt_to_equity", tier3Max: 1, tier2Max: 2, displayHint: "x" }, weightNew: 10, weightRenewal: 10 },
  5: { number: 5, label: "Paid-up capital cover", band: { kind: "interval", tier3Min: 2, tier2Min: 1, displayHint: "x" }, weightNew: 5, weightRenewal: 5 },
  6: { number: 6, label: "Profitability history", band: { kind: "categorical", binary: false }, weightNew: 25, weightRenewal: 15 },
  7: { number: 7, label: "Years registered in SG", band: { kind: "interval", tier3Min: 10, tier2Min: 5, displayHint: "years" }, weightNew: 10, weightRenewal: 5 },
  8: { number: 8, label: "Litigation record", band: { kind: "categorical", binary: true }, weightNew: 10, weightRenewal: 10 },
  9: { number: 9, label: "Change in directors, last 3 yrs", band: { kind: "categorical", binary: true }, weightNew: 5, weightRenewal: 5 },
  10: { number: 10, label: "Positive net operating cash flow", band: { kind: "categorical", binary: true }, weightNew: 10, weightRenewal: 10 },
  11: { number: 11, label: "Prompt payment record", band: { kind: "categorical", binary: true }, weightNew: 0, weightRenewal: 15 },
};

// FR6.8 — rating classes.
export const RATING_CLASSES: { min: number; max: number; ratingClass: "A" | "B" | "C"; handlingRoute: string }[] = [
  { min: 240, max: 300, ratingClass: "A", handlingRoute: "Auto-recommend with GIRO; escalate to approving authority per MOA" },
  { min: 180, max: 239, ratingClass: "B", handlingRoute: "Manual review with credit enhancement" },
  { min: 100, max: 179, ratingClass: "C", handlingRoute: "Not recommended by Risk and Compliance" },
];

// PRD's Division is free-text on Assessment (§4/glossary) — this bounded list
// is a demo convenience for the prototype's select inputs, not a spec
// requirement. Swappable for a real lookup with no schema change.
export const DIVISIONS = ["Trade Finance", "Working Capital Solutions", "Structured Trade"];

export const CURRENCIES = ["SGD", "USD"];

export const PRESENTATION_SCALES: PresentationScale[] = ["units", "thousands", "millions"];
