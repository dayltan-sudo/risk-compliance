import type { CriterionInput, ExtractedField, Ratio, RatioKey, StandardFieldName, ZeroDivisorField } from "../types.js";
import { SCORECARD_VERSION } from "../data/config.js";

// FR4 — Ratio Engine (Calculation module, Scoring & Decisioning.md Flow A).
// Deterministic: same confirmed inputs + scorecard version -> same output,
// always. Formulas and zero-divisor treatment are closed by
// Baseline_Scorecard_Extract_v1.2.md / PRD FR4.2/FR4.11/FR4.12 — nothing here
// is a placeholder.
//
// Callers must only pass Confirmed/Amended fields and criterion inputs
// (FR3.8) — this engine trusts its input and does not re-check status.

function fieldValue(fields: ExtractedField[], period: string, name: StandardFieldName): number | boolean | null {
  const f = fields.find((x) => x.period === period && x.fieldName === name);
  return f ? f.value : null;
}

function fieldId(fields: ExtractedField[], period: string, name: StandardFieldName): string | undefined {
  return fields.find((x) => x.period === period && x.fieldName === name)?.id;
}

/** FR4.6 — period-over-period change. Computed at read time, never stored on
 * Ratio (Scoring & Decisioning.md Flow A Node 4). Null (render "—") when the
 * prior value is absent, zero, or non-numeric — never a fabricated 0. */
export function fieldPeriodChange(fields: ExtractedField[], fieldName: StandardFieldName, currentPeriod: string, priorPeriod: string): number | null {
  const current = fieldValue(fields, currentPeriod, fieldName);
  const prior = fieldValue(fields, priorPeriod, fieldName);
  if (typeof current !== "number" || typeof prior !== "number" || prior === 0) return null;
  return (current - prior) / prior;
}

interface PeriodRatioDef {
  key: Extract<RatioKey, "working_capital" | "current_ratio" | "net_profit_margin" | "debt_to_equity" | "wc_over_revenue">;
  label: string;
  formulaDisplay: string;
  requires: StandardFieldName[];
  divisorField: StandardFieldName | null; // null = never a zero-divisor case (subtraction)
  zeroDivisorField: ZeroDivisorField | null;
  zeroDivisorTier: 1 | 2 | 3 | null;
  compute: (v: Record<string, number>) => number;
}

const PERIOD_RATIO_DEFS: PeriodRatioDef[] = [
  {
    key: "working_capital",
    label: "Working Capital",
    formulaDisplay: "Current Assets − Current Liabilities",
    requires: ["Current Assets", "Current Liabilities"],
    divisorField: null,
    zeroDivisorField: null,
    zeroDivisorTier: null,
    compute: (v) => v["Current Assets"] - v["Current Liabilities"],
  },
  {
    key: "current_ratio",
    label: "Current Ratio",
    formulaDisplay: "Current Assets ÷ Current Liabilities",
    requires: ["Current Assets", "Current Liabilities"],
    divisorField: "Current Liabilities",
    // FR4.12: no current liabilities is the strongest possible liquidity — tier 3, never a Not Calculable case.
    zeroDivisorField: "Current Liabilities",
    zeroDivisorTier: 3,
    compute: (v) => v["Current Assets"] / v["Current Liabilities"],
  },
  {
    key: "net_profit_margin",
    label: "Net Profit Margin",
    formulaDisplay: "NPAT ÷ Sales",
    requires: ["NPAT", "Sales"],
    divisorField: "Sales",
    zeroDivisorField: "Sales",
    zeroDivisorTier: 1,
    compute: (v) => v["NPAT"] / v["Sales"],
  },
  {
    key: "debt_to_equity",
    label: "Debt to Equity",
    formulaDisplay: "Total Liabilities ÷ Total Equity",
    requires: ["Total Liabilities", "Total Equity"],
    divisorField: "Total Equity",
    // FR4.12: no equity buffer — tier 1, alongside the negative-equity band case rating.ts handles separately.
    zeroDivisorField: "Total Equity",
    zeroDivisorTier: 1,
    compute: (v) => v["Total Liabilities"] / v["Total Equity"],
  },
  {
    key: "wc_over_revenue",
    label: "WC over Revenue",
    formulaDisplay: "(Current Assets − Current Liabilities) ÷ Sales",
    requires: ["Current Assets", "Current Liabilities", "Sales"],
    divisorField: "Sales",
    zeroDivisorField: "Sales",
    zeroDivisorTier: 1,
    compute: (v) => (v["Current Assets"] - v["Current Liabilities"]) / v["Sales"],
  },
];

function computePeriodRatio(assessmentId: string, period: string, fields: ExtractedField[], now: string): Ratio[] {
  return PERIOD_RATIO_DEFS.map((def) => {
    const raw = def.requires.map((name) => ({ name, value: fieldValue(fields, period, name) }));
    const lineageFieldIds = def.requires.map((name) => fieldId(fields, period, name)).filter((id): id is string => !!id);
    const absentField = raw.find((r) => r.value === null || typeof r.value !== "number");

    let valueNumeric: number | null = null;
    let notCalculableReason: string | null = null;
    let zeroDivisorField: ZeroDivisorField | null = null;
    let zeroDivisorTierApplied: 1 | 2 | 3 | null = null;

    if (absentField) {
      // FR4.7/FR4.11 — absent input checked first, never a substituted zero.
      notCalculableReason = `${absentField.name} is confirmed absent (${period})`;
    } else {
      const v = Object.fromEntries(raw.map((r) => [r.name, r.value as number]));
      if (def.divisorField && v[def.divisorField] === 0) {
        zeroDivisorField = def.zeroDivisorField;
        zeroDivisorTierApplied = def.zeroDivisorTier;
      } else {
        valueNumeric = def.compute(v);
      }
    }

    return {
      id: `ratio-${assessmentId}-${period}-${def.key}`,
      assessmentId,
      ratioKey: def.key,
      label: def.label,
      formulaDisplay: def.formulaDisplay,
      lineageFieldIds,
      period,
      valueNumeric,
      signPair: null,
      notCalculableReason,
      zeroDivisorField,
      zeroDivisorTierApplied,
      scorecardVersion: SCORECARD_VERSION,
      computedAt: now,
    } satisfies Ratio;
  });
}

/** Criterion 6 — stores the raw NPAT sign fact only; rating.ts applies
 * FR6.13's four-way tiering. Not period-scoped (spans both periods). */
function computeProfitabilityHistory(assessmentId: string, currentPeriod: string, priorPeriod: string, fields: ExtractedField[], now: string): Ratio {
  const current = fieldValue(fields, currentPeriod, "NPAT");
  const prior = fieldValue(fields, priorPeriod, "NPAT");
  const lineageFieldIds = [fieldId(fields, currentPeriod, "NPAT"), fieldId(fields, priorPeriod, "NPAT")].filter((id): id is string => !!id);

  // FR6.5 — the latest period's NPAT being absent is an absent input, not a
  // loss; it scores tier 1 via notCalculableReason, never via FR6.13's sign logic.
  const notCalculableReason = typeof current !== "number" ? `NPAT is confirmed absent (${currentPeriod})` : null;

  return {
    id: `ratio-${assessmentId}-profitability_history`,
    assessmentId,
    ratioKey: "profitability_history",
    label: "Profitability History",
    formulaDisplay: "NPAT sign, current period vs. prior",
    lineageFieldIds,
    period: null,
    valueNumeric: null,
    signPair: {
      currentPositive: typeof current === "number" ? current > 0 : null,
      // Absent prior is treated as "not profitable" for FR6.13's tiering — it
      // cannot prove a prior profit, so a current-profitable/prior-absent
      // pair lands tier 2, never tier 3.
      priorPositive: typeof prior === "number" ? prior > 0 : null,
    },
    notCalculableReason,
    zeroDivisorField: null,
    zeroDivisorTierApplied: null,
    scorecardVersion: SCORECARD_VERSION,
    computedAt: now,
  };
}

/** Criterion 5 — paid-up capital cover. Reads CriterionInput, not
 * ExtractedField. Never reaches a zero-divisor: total exposure <= 0 is
 * rejected at entry (FR5.15). Not period-scoped. */
function computePaidUpCapitalCover(assessmentId: string, criterionInputs: CriterionInput[], now: string): Ratio {
  const c5 = criterionInputs.find((c) => c.criterionNumber === 5);
  const missing = !c5 || c5.paidUpCapital === null || c5.totalExposure === null;
  return {
    id: `ratio-${assessmentId}-paid_up_capital_cover`,
    assessmentId,
    ratioKey: "paid_up_capital_cover",
    label: "Paid-up Capital Cover",
    formulaDisplay: "Paid-up Capital ÷ Total Exposure",
    lineageFieldIds: c5 ? [c5.id] : [],
    period: null,
    valueNumeric: missing ? null : (c5!.paidUpCapital as number) / (c5!.totalExposure as number),
    signPair: null,
    notCalculableReason: missing ? "Paid-up capital or total exposure is confirmed absent" : null,
    zeroDivisorField: null,
    zeroDivisorTierApplied: null,
    scorecardVersion: SCORECARD_VERSION,
    computedAt: now,
  };
}

/** Criterion 7 — years established. Reads CriterionInput. Never a
 * zero-divisor case (subtraction). Not period-scoped. */
function computeYearsEstablished(assessmentId: string, criterionInputs: CriterionInput[], assessmentYear: number, now: string): Ratio {
  const c7 = criterionInputs.find((c) => c.criterionNumber === 7);
  const missing = !c7 || c7.yearRegisteredSg === null;
  return {
    id: `ratio-${assessmentId}-years_established`,
    assessmentId,
    ratioKey: "years_established",
    label: "Years Established",
    formulaDisplay: "Assessment Year − Year Registered in SG",
    lineageFieldIds: c7 ? [c7.id] : [],
    period: null,
    valueNumeric: missing ? null : assessmentYear - (c7!.yearRegisteredSg as number),
    signPair: null,
    notCalculableReason: missing ? "Year registered in Singapore is confirmed absent" : null,
    zeroDivisorField: null,
    zeroDivisorTierApplied: null,
    scorecardVersion: SCORECARD_VERSION,
    computedAt: now,
  };
}

/** FR4.1/FR3.8 — the full ratio set for one assessment: the 4 FR4.2 ratios
 * for each period, plus the 4 FR4.3 derived scorecard inputs. Only called
 * once every review item is Confirmed/Amended (the store's gate) — every
 * field/input passed in is trusted as reviewed. */
export function computeRatios(
  assessmentId: string,
  fields: ExtractedField[],
  criterionInputs: CriterionInput[],
  currentPeriod: string,
  priorPeriod: string,
  assessmentYear: number,
  now: string,
): Ratio[] {
  return [
    ...computePeriodRatio(assessmentId, currentPeriod, fields, now),
    ...computePeriodRatio(assessmentId, priorPeriod, fields, now),
    computeProfitabilityHistory(assessmentId, currentPeriod, priorPeriod, fields, now),
    computePaidUpCapitalCover(assessmentId, criterionInputs, now),
    computeYearsEstablished(assessmentId, criterionInputs, assessmentYear, now),
  ];
}
