import type { ExtractedField, Ratio, RatioCategory, ScorecardConfig } from "../types";

// FR4 — Ratio Engine. Deterministic (architecture plan §02/§05): given the
// same confirmed/unconfirmed field set and config version, always the same
// output. PLACEHOLDER formulas — see data/config.ts header.

interface RatioDef {
  key: string;
  label: string;
  category: RatioCategory;
  requires: string[]; // standardized field names
  formulaDisplay: string;
  compute: (v: Record<string, number>) => number | null; // null = mathematically undefined (e.g. div by 0)
}

const RATIO_DEFS: RatioDef[] = [
  {
    key: "current_ratio",
    label: "Current Ratio",
    category: "Liquidity",
    requires: ["Total Current Assets", "Total Current Liabilities"],
    formulaDisplay: "Total Current Assets ÷ Total Current Liabilities",
    compute: (v) => (v["Total Current Liabilities"] === 0 ? null : v["Total Current Assets"] / v["Total Current Liabilities"]),
  },
  {
    key: "quick_ratio",
    label: "Quick Ratio",
    category: "Liquidity",
    requires: ["Total Current Assets", "Inventory", "Total Current Liabilities"],
    formulaDisplay: "(Total Current Assets − Inventory) ÷ Total Current Liabilities",
    compute: (v) =>
      v["Total Current Liabilities"] === 0 ? null : (v["Total Current Assets"] - v["Inventory"]) / v["Total Current Liabilities"],
  },
  {
    key: "debt_to_equity",
    label: "Debt-to-Equity",
    category: "Leverage",
    requires: ["Total Debt", "Total Equity"],
    formulaDisplay: "Total Debt ÷ Total Equity",
    compute: (v) => (v["Total Equity"] === 0 ? null : v["Total Debt"] / v["Total Equity"]),
  },
  {
    key: "debt_to_ebitda",
    label: "Debt-to-EBITDA",
    category: "Leverage",
    requires: ["Total Debt", "EBITDA"],
    formulaDisplay: "Total Debt ÷ EBITDA",
    compute: (v) => (v["EBITDA"] === 0 ? null : v["Total Debt"] / v["EBITDA"]),
  },
  {
    key: "gearing",
    label: "Gearing",
    category: "Leverage",
    requires: ["Total Debt", "Total Equity"],
    formulaDisplay: "Total Debt ÷ (Total Debt + Total Equity)",
    compute: (v) => (v["Total Debt"] + v["Total Equity"] === 0 ? null : v["Total Debt"] / (v["Total Debt"] + v["Total Equity"])),
  },
  {
    key: "gross_margin",
    label: "Gross Margin",
    category: "Profitability",
    requires: ["Gross Profit", "Revenue"],
    formulaDisplay: "Gross Profit ÷ Revenue",
    compute: (v) => (v["Revenue"] === 0 ? null : v["Gross Profit"] / v["Revenue"]),
  },
  {
    key: "net_margin",
    label: "Net Margin",
    category: "Profitability",
    requires: ["Net Income", "Revenue"],
    formulaDisplay: "Net Income ÷ Revenue",
    compute: (v) => (v["Revenue"] === 0 ? null : v["Net Income"] / v["Revenue"]),
  },
  {
    key: "roe",
    label: "Return on Equity",
    category: "Profitability",
    requires: ["Net Income", "Total Equity"],
    formulaDisplay: "Net Income ÷ Total Equity",
    compute: (v) => (v["Total Equity"] === 0 ? null : v["Net Income"] / v["Total Equity"]),
  },
  {
    key: "roa",
    label: "Return on Assets",
    category: "Profitability",
    requires: ["Net Income", "Total Assets"],
    formulaDisplay: "Net Income ÷ Total Assets",
    compute: (v) => (v["Total Assets"] === 0 ? null : v["Net Income"] / v["Total Assets"]),
  },
  {
    key: "interest_coverage",
    label: "Interest Coverage",
    category: "Coverage",
    requires: ["EBIT", "Interest Expense"],
    formulaDisplay: "EBIT ÷ Interest Expense",
    compute: (v) => (v["Interest Expense"] === 0 ? null : v["EBIT"] / v["Interest Expense"]),
  },
  {
    key: "dscr",
    label: "Debt Service Coverage Ratio",
    category: "Coverage",
    requires: ["Operating Cash Flow", "Interest Expense"],
    formulaDisplay: "Operating Cash Flow ÷ Interest Expense",
    compute: (v) => (v["Interest Expense"] === 0 ? null : v["Operating Cash Flow"] / v["Interest Expense"]),
  },
  {
    key: "asset_turnover",
    label: "Asset Turnover",
    category: "Efficiency",
    requires: ["Revenue", "Total Assets"],
    formulaDisplay: "Revenue ÷ Total Assets",
    compute: (v) => (v["Total Assets"] === 0 ? null : v["Revenue"] / v["Total Assets"]),
  },
  {
    key: "dso",
    label: "Days Sales Outstanding",
    category: "Efficiency",
    requires: ["Accounts Receivable", "Revenue"],
    formulaDisplay: "(Accounts Receivable ÷ Revenue) × 365",
    compute: (v) => (v["Revenue"] === 0 ? null : (v["Accounts Receivable"] / v["Revenue"]) * 365),
  },
  {
    key: "dpo",
    label: "Days Payable Outstanding",
    category: "Efficiency",
    requires: ["Accounts Payable", "Cost of Goods Sold"],
    formulaDisplay: "(Accounts Payable ÷ COGS) × 365",
    compute: (v) => (v["Cost of Goods Sold"] === 0 ? null : (v["Accounts Payable"] / v["Cost of Goods Sold"]) * 365),
  },
  {
    key: "dio",
    label: "Days Inventory Outstanding",
    category: "Efficiency",
    requires: ["Inventory", "Cost of Goods Sold"],
    formulaDisplay: "(Inventory ÷ COGS) × 365",
    compute: (v) => (v["Cost of Goods Sold"] === 0 ? null : (v["Inventory"] / v["Cost of Goods Sold"]) * 365),
  },
];

export const RATIO_KEYS = RATIO_DEFS.map((d) => d.key);

/** FR4.1/FR3.8 — compute the full ratio set for one assessment x period.
 * Unconfirmed-but-present inputs compute and flag Provisional (never excluded).
 * Any required input Not Present -> Not Calculable, value null, no substitution.
 */
export function computeRatiosForPeriod(
  assessmentId: string,
  period: string,
  fields: ExtractedField[],
  config: ScorecardConfig,
  now: string,
): Ratio[] {
  const byName = new Map<string, ExtractedField>();
  for (const f of fields) {
    if (f.assessmentId === assessmentId && f.period === period) byName.set(f.fieldName, f);
  }

  return RATIO_DEFS.map((def) => {
    const inputs = def.requires.map((name) => byName.get(name));
    const anyNotPresent = inputs.some((f) => !f || f.status === "Not Present");
    const anyUnconfirmed = inputs.some((f) => f && f.status === "Unconfirmed");

    let value: number | null = null;
    let notCalculableFlag = false;
    let provisionalFlag = false;

    if (anyNotPresent) {
      notCalculableFlag = true;
    } else {
      const v: Record<string, number> = {};
      for (const f of inputs) v[f!.fieldName] = f!.value ?? 0;
      const result = def.compute(v);
      if (result === null) {
        notCalculableFlag = true; // mathematically undefined (e.g. divide by zero)
      } else {
        value = result;
        provisionalFlag = anyUnconfirmed;
      }
    }

    return {
      id: `ratio-${assessmentId}-${period}-${def.key}`,
      assessmentId,
      ratioKey: def.key,
      label: def.label,
      category: def.category,
      formulaDisplay: def.formulaDisplay,
      lineageFieldIds: inputs.filter((f): f is ExtractedField => !!f).map((f) => f.id),
      value,
      period,
      configVersionId: config.id,
      provisionalFlag,
      notCalculableFlag,
      computedAt: now,
    } satisfies Ratio;
  });
}

export function computeAllRatios(
  assessmentId: string,
  periods: string[],
  fields: ExtractedField[],
  config: ScorecardConfig,
  now: string,
): Ratio[] {
  return periods.flatMap((p) => computeRatiosForPeriod(assessmentId, p, fields, config, now));
}
