import type { ExtractedField, IntegrityCheckName, IntegrityCheckResult, OperandMovement, StandardFieldName } from "../types";
import { INTEGRITY_TOLERANCE_PCT } from "../data/config";
import { fieldPeriodChange } from "./ratios";

// FR3.6/3.7 — the nine integrity checks, plus FR3.13's discrepancy
// attribution. Runs automatically once Extraction's field skeleton exists for
// a period (Field Review.md Flow C) — NOT tied to any confirm action, and NOT
// gated by review completion. Every check is evaluated per period: each
// period's own statement must independently balance.
//
// Arithmetic, not judgement — no model, per FR3.13.

interface CheckDef {
  name: IntegrityCheckName;
  operands: StandardFieldName[];
  kind: "inequality" | "equality";
  // expected/actual generalize both shapes: for an inequality A<=B, expected=B,
  // actual=A; for an equality X=Y+Z, expected=Y+Z, actual=X. A signed
  // difference (expected-actual) is meaningful either way (FR3.13).
  evaluate: (v: Record<string, number>) => { expected: number; actual: number; passed: boolean };
}

const CHECKS: CheckDef[] = [
  {
    name: "npat_le_sales",
    operands: ["NPAT", "Sales"],
    kind: "inequality",
    evaluate: (v) => ({ expected: v["Sales"], actual: v["NPAT"], passed: v["NPAT"] <= v["Sales"] }),
  },
  {
    name: "cash_le_current_assets",
    operands: ["Cash and Bank Balances", "Current Assets"],
    kind: "inequality",
    evaluate: (v) => ({ expected: v["Current Assets"], actual: v["Cash and Bank Balances"], passed: v["Cash and Bank Balances"] <= v["Current Assets"] }),
  },
  {
    name: "current_assets_le_total_assets",
    operands: ["Current Assets", "Total Assets"],
    kind: "inequality",
    evaluate: (v) => ({ expected: v["Total Assets"], actual: v["Current Assets"], passed: v["Current Assets"] <= v["Total Assets"] }),
  },
  {
    name: "non_current_assets_le_total_assets",
    operands: ["Non-Current Assets", "Total Assets"],
    kind: "inequality",
    evaluate: (v) => ({ expected: v["Total Assets"], actual: v["Non-Current Assets"], passed: v["Non-Current Assets"] <= v["Total Assets"] }),
  },
  {
    name: "current_liabilities_le_total_liabilities",
    operands: ["Current Liabilities", "Total Liabilities"],
    kind: "inequality",
    evaluate: (v) => ({ expected: v["Total Liabilities"], actual: v["Current Liabilities"], passed: v["Current Liabilities"] <= v["Total Liabilities"] }),
  },
  {
    name: "non_current_liabilities_le_total_liabilities",
    operands: ["Non-Current Liabilities", "Total Liabilities"],
    kind: "inequality",
    evaluate: (v) => ({ expected: v["Total Liabilities"], actual: v["Non-Current Liabilities"], passed: v["Non-Current Liabilities"] <= v["Total Liabilities"] }),
  },
  {
    // For every equality check, `passed` is filled in by the caller (tolerance
    // basis is always Total Assets, per FR3.7 — not necessarily this check's
    // own `actual`) — the placeholder `false` here is never read.
    name: "total_assets_eq_ca_plus_nca",
    operands: ["Total Assets", "Current Assets", "Non-Current Assets"],
    kind: "equality",
    evaluate: (v) => ({ expected: v["Current Assets"] + v["Non-Current Assets"], actual: v["Total Assets"], passed: false }),
  },
  {
    name: "total_liabilities_eq_cl_plus_ncl",
    operands: ["Total Liabilities", "Current Liabilities", "Non-Current Liabilities"],
    kind: "equality",
    evaluate: (v) => ({ expected: v["Current Liabilities"] + v["Non-Current Liabilities"], actual: v["Total Liabilities"], passed: false }),
  },
  {
    name: "equity_plus_liabilities_eq_assets",
    operands: ["Total Equity", "Total Liabilities", "Total Assets"],
    kind: "equality",
    evaluate: (v) => ({ expected: v["Total Equity"] + v["Total Liabilities"], actual: v["Total Assets"], passed: false }),
  },
];

function withinTolerance(expected: number, actual: number, totalAssets: number): boolean {
  return Math.abs(expected - actual) <= INTEGRITY_TOLERANCE_PCT * Math.abs(totalAssets);
}

function fieldValue(fields: ExtractedField[], period: string, name: StandardFieldName): number | null {
  const f = fields.find((x) => x.period === period && x.fieldName === name);
  return f && typeof f.value === "number" ? f.value : null;
}

function fieldId(fields: ExtractedField[], period: string, name: StandardFieldName): string | undefined {
  return fields.find((x) => x.period === period && x.fieldName === name)?.id;
}

function rankOperandMovement(fields: ExtractedField[], operands: StandardFieldName[], currentPeriod: string, priorPeriod: string): OperandMovement[] {
  return operands
    .map((fieldName) => ({ fieldName, changePct: fieldPeriodChange(fields, fieldName, currentPeriod, priorPeriod) }))
    .filter((m) => m.changePct !== null) // excluded, never defaulted to 0 or last place (FR3.13)
    .sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number));
}

/** FR3.6/3.7/3.13 — every check, every period. `currentPeriod`/`priorPeriod`
 * are the assessment's fixed pair, used for FR3.13's movement ranking
 * regardless of which period a given check failed on. */
export function computeIntegrityChecks(
  assessmentId: string,
  fields: ExtractedField[],
  periods: string[],
  currentPeriod: string,
  priorPeriod: string,
  now: string,
): IntegrityCheckResult[] {
  const out: IntegrityCheckResult[] = [];

  for (const period of periods) {
    for (const check of CHECKS) {
      const values = check.operands.map((name) => ({ name, value: fieldValue(fields, period, name) }));
      if (values.some((v) => v.value === null)) continue; // not evaluated — an operand has no live value yet

      const v = Object.fromEntries(values.map((x) => [x.name, x.value as number]));
      const totalAssets = fieldValue(fields, period, "Total Assets") ?? 0;
      const evaluated = check.evaluate(v);
      const result =
        check.kind === "equality" ? { ...evaluated, passed: withinTolerance(evaluated.expected, evaluated.actual, totalAssets) } : evaluated;

      const operandFieldIds = check.operands.map((name) => fieldId(fields, period, name)).filter((id): id is string => !!id);

      out.push({
        id: `check-${assessmentId}-${period}-${check.name}`,
        assessmentId,
        checkName: check.name,
        period,
        operandFieldIds,
        expected: result.expected,
        actual: result.actual,
        passed: result.passed,
        toleranceApplied: check.kind === "equality" ? INTEGRITY_TOLERANCE_PCT * Math.abs(totalAssets) : null,
        difference: result.passed ? null : result.expected - result.actual,
        operandMovementRanking: result.passed ? null : rankOperandMovement(fields, check.operands, currentPeriod, priorPeriod),
        evaluatedAt: now,
      });
    }
  }

  return out;
}
