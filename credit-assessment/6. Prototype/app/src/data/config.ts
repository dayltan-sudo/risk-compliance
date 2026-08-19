import type { ScorecardConfig } from "../types";

// PRD §0: "The client's baseline credit-assessment Excel template — which will
// define the exact ratio formulas, scorecard weights, and rating bands — has
// not been supplied. Every ratio, weight, and band reference ... is marked
// PLACEHOLDER or OPEN; none is final." (PRD v0.10, FR4.1/FR5.1/FR6.1)
//
// Architecture plan §5/§10: build the versioned config *seam* now, fill the
// *content* once the template lands. This file is that seam's illustrative
// content — clearly a placeholder, never a real credit methodology.

export const PLACEHOLDER_CONFIG: ScorecardConfig = {
  id: "config-v0.1-prototype",
  version: "v0.1-prototype",
  effectiveDate: "2026-01-01",
  createdBy: "system (seed)",
  confidenceThresholds: { high: 90, medium: 70 }, // FR2.4

  // direction: which side of the boundary is favourable
  ratioBands: {
    current_ratio: { good: 1.5, fair: 1.0, direction: "higher-better" },
    quick_ratio: { good: 1.0, fair: 0.7, direction: "higher-better" },
    debt_to_equity: { good: 1.0, fair: 2.0, direction: "lower-better" },
    debt_to_ebitda: { good: 2.5, fair: 4.0, direction: "lower-better" },
    gearing: { good: 0.4, fair: 0.6, direction: "lower-better" },
    gross_margin: { good: 0.35, fair: 0.2, direction: "higher-better" },
    net_margin: { good: 0.1, fair: 0.03, direction: "higher-better" },
    roe: { good: 0.15, fair: 0.05, direction: "higher-better" },
    roa: { good: 0.08, fair: 0.02, direction: "higher-better" },
    interest_coverage: { good: 5, fair: 2, direction: "higher-better" },
    dscr: { good: 2, fair: 1.2, direction: "higher-better" },
    asset_turnover: { good: 1.2, fair: 0.7, direction: "higher-better" },
    dso: { good: 45, fair: 65, direction: "lower-better" },
    dpo: { good: 40, fair: 60, direction: "lower-better" },
    dio: { good: 45, fair: 70, direction: "lower-better" },
  },

  scorecardWeights: {
    current_ratio: 0.08,
    quick_ratio: 0.06,
    debt_to_equity: 0.1,
    debt_to_ebitda: 0.1,
    gearing: 0.06,
    gross_margin: 0.08,
    net_margin: 0.1,
    roe: 0.08,
    roa: 0.06,
    interest_coverage: 0.1,
    dscr: 0.08,
    asset_turnover: 0.04,
    dso: 0.03,
    dpo: 0.02,
    dio: 0.01,
  },

  gradeBands: [
    { minScore: 85, grade: "A", band: "Low risk" },
    { minScore: 70, grade: "BB", band: "Moderate risk" },
    { minScore: 55, grade: "B", band: "Elevated risk" },
    { minScore: 40, grade: "CCC", band: "High risk" },
    { minScore: 0, grade: "D", band: "Very high risk" },
  ],

  limitRules: [
    { grade: "A", limitMultiplierOfRevenue: 0.15, termsDays: 60 },
    { grade: "BB", limitMultiplierOfRevenue: 0.08, termsDays: 45 },
    { grade: "B", limitMultiplierOfRevenue: 0.04, termsDays: 30 },
    { grade: "CCC", limitMultiplierOfRevenue: 0.02, termsDays: 15 },
    { grade: "D", limitMultiplierOfRevenue: 0, termsDays: 0 },
  ],
};

// FR2.1 — standardized field set. OPEN in the PRD (derives from the baseline
// template); this is an illustrative generic set covering the FR4.1 ratio
// categories, grouped by statement section for the FR3.1 review screen.
export const STANDARD_FIELDS: { name: string; section: "Balance Sheet" | "Income Statement" | "Cash Flow" }[] = [
  { name: "Cash & Equivalents", section: "Balance Sheet" },
  { name: "Accounts Receivable", section: "Balance Sheet" },
  { name: "Inventory", section: "Balance Sheet" },
  { name: "Total Current Assets", section: "Balance Sheet" },
  { name: "Total Assets", section: "Balance Sheet" },
  { name: "Accounts Payable", section: "Balance Sheet" },
  { name: "Total Current Liabilities", section: "Balance Sheet" },
  { name: "Total Debt", section: "Balance Sheet" },
  { name: "Total Liabilities", section: "Balance Sheet" },
  { name: "Total Equity", section: "Balance Sheet" },
  { name: "Revenue", section: "Income Statement" },
  { name: "Cost of Goods Sold", section: "Income Statement" },
  { name: "Gross Profit", section: "Income Statement" },
  { name: "EBITDA", section: "Income Statement" },
  { name: "EBIT", section: "Income Statement" },
  { name: "Interest Expense", section: "Income Statement" },
  { name: "Net Income", section: "Income Statement" },
  { name: "Operating Cash Flow", section: "Cash Flow" },
  { name: "Capital Expenditure", section: "Cash Flow" },
];
