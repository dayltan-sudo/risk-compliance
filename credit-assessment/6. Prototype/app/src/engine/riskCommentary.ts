import type { CitedFigure, CriterionInput, ExtractedField, Rating, RiskCommentary, RiskObservation, Ratio } from "../types";
import { SCORECARD } from "../data/config";

// FR11 — Risk Commentary. PROTOTYPE STAND-IN, not a model call: this is a
// client-only prototype with no backend and no other network dependency, so
// FR11's "model surface" is approximated here by six deterministic,
// arithmetic checks against the FR11.10 candidate categories. Each check
// either produces an observation with its citations already attached, or
// nothing — there is no generate-then-strip pipeline, since a check that
// cannot cite its figures simply never fires (satisfies FR11.3 by
// construction). Every observation is purely descriptive: it states what the
// data shows and proposes nothing (FR11.4), and carries no severity or rank
// (FR11.5). See Risk Commentary.md for what a real model surface would do
// here instead.

const MODEL_VERSION = "prototype-stub-v1";
const PROMPT_VERSION = "n/a-rule-based";

function driverFor(rating: Rating, criterionNumber: number) {
  return rating.driverBreakdown.find((d) => d.criterionNumber === criterionNumber);
}

function fieldValue(fields: ExtractedField[], period: string, name: string): number | null {
  const f = fields.find((x) => x.period === period && x.fieldName === name);
  return f && typeof f.value === "number" ? f.value : null;
}

function ratioValue(ratios: Ratio[], key: Ratio["ratioKey"], period: string | null): number | null {
  return ratios.find((r) => r.ratioKey === key && r.period === period)?.valueNumeric ?? null;
}

function ratioChange(ratios: Ratio[], key: Ratio["ratioKey"], currentPeriod: string, priorPeriod: string): number | null {
  const current = ratioValue(ratios, key, currentPeriod);
  const prior = ratioValue(ratios, key, priorPeriod);
  if (current === null || prior === null || prior === 0) return null;
  return (current - prior) / prior;
}

function fig(entity: string, field: string, value: string): CitedFigure {
  return { entity, field, value };
}

export function generateRiskCommentary(
  assessmentId: string,
  ratingId: string,
  rating: Rating,
  ratios: Ratio[],
  fields: ExtractedField[],
  criterionInputs: CriterionInput[],
  currentPeriod: string,
  priorPeriod: string,
  now: string,
): RiskCommentary {
  const observations: RiskObservation[] = [];

  // 1. Earnings quality — profit is positive but operating cash flow is not.
  const d6 = driverFor(rating, 6);
  const d10 = driverFor(rating, 10);
  if (d6 && d6.tier >= 2 && d10 && d10.tier === 1) {
    const npat = fieldValue(fields, currentPeriod, "NPAT");
    observations.push({
      category: "Earnings quality",
      statement: "The latest period reports NPAT above zero, but net operating cash flow is not positive for the same period — earnings are not yet converting to cash.",
      citedFigures: [
        fig(currentPeriod, "NPAT", npat !== null ? npat.toLocaleString() : "confirmed absent"),
        fig(currentPeriod, "Net Operating Cash Flow Positive", "No"),
      ],
    });
  }

  // 2. Capital erosion — total equity sits far below paid-up capital.
  const c5 = criterionInputs.find((c) => c.criterionNumber === 5);
  const totalEquity = fieldValue(fields, currentPeriod, "Total Equity");
  if (c5?.paidUpCapital !== null && c5?.paidUpCapital !== undefined && totalEquity !== null && totalEquity < 0.5 * c5.paidUpCapital) {
    observations.push({
      category: "Capital erosion",
      statement: "Total equity sits at less than half of paid-up capital — the entity has consumed a substantial share of its original capital base.",
      citedFigures: [
        fig(currentPeriod, "Total Equity", totalEquity.toLocaleString()),
        fig("Criterion 5 input", "Paid-up Capital", c5.paidUpCapital.toLocaleString()),
      ],
    });
  }

  // 3. Liquidity composition — a healthy current ratio rests on little cash.
  const currentRatioVal = ratioValue(ratios, "current_ratio", currentPeriod);
  const cash = fieldValue(fields, currentPeriod, "Cash and Bank Balances");
  const currentAssets = fieldValue(fields, currentPeriod, "Current Assets");
  const tier3MinCurrentRatio = SCORECARD[2].band.kind === "interval" ? SCORECARD[2].band.tier3Min : null;
  if (currentRatioVal !== null && tier3MinCurrentRatio !== null && currentRatioVal >= tier3MinCurrentRatio && cash !== null && currentAssets !== null && currentAssets > 0 && cash / currentAssets < 0.15) {
    observations.push({
      category: "Liquidity composition",
      statement: "The current ratio scores in the top band, but cash makes up a small share of current assets — the liquidity is concentrated in less-liquid current-asset lines.",
      citedFigures: [
        fig(currentPeriod, "Current Ratio", `${currentRatioVal.toFixed(2)}x`),
        fig(currentPeriod, "Cash and Bank Balances", cash.toLocaleString()),
        fig(currentPeriod, "Current Assets", currentAssets.toLocaleString()),
      ],
    });
  }

  // 4. Concentration — total exposure is large against the customer's sales.
  const sales = fieldValue(fields, currentPeriod, "Sales");
  if (c5?.totalExposure !== null && c5?.totalExposure !== undefined && sales !== null && sales > 0 && c5.totalExposure / sales > 0.25) {
    observations.push({
      category: "Concentration",
      statement: "Total exposure represents more than a quarter of the customer's latest-period sales — a significant concentration against the scale of the business being assessed.",
      citedFigures: [
        fig("Criterion 5 input", "Total Exposure", c5.totalExposure.toLocaleString()),
        fig(currentPeriod, "Sales", sales.toLocaleString()),
      ],
    });
  }

  // 5. Trajectory — a ratio scores well but has moved sharply the wrong way.
  const trajectoryChecks: { key: Ratio["ratioKey"]; criterionNumber: number; higherBetter: boolean; label: string }[] = [
    { key: "current_ratio", criterionNumber: 2, higherBetter: true, label: "Current Ratio" },
    { key: "net_profit_margin", criterionNumber: 3, higherBetter: true, label: "Net Profit Margin" },
    { key: "debt_to_equity", criterionNumber: 4, higherBetter: false, label: "Debt to Equity" },
    { key: "wc_over_revenue", criterionNumber: 1, higherBetter: true, label: "WC over Revenue" },
  ];
  for (const t of trajectoryChecks) {
    const driver = driverFor(rating, t.criterionNumber);
    if (!driver || driver.tier < 2) continue;
    const currentVal = ratioValue(ratios, t.key, currentPeriod);
    const priorVal = ratioValue(ratios, t.key, priorPeriod);
    // Percentage change is directionally unreliable once the prior value
    // crosses zero (e.g. a loss-to-profit swing computes as a large adverse
    // percentage purely from dividing by a negative prior) — skip the
    // trajectory check rather than risk mislabeling an improvement as adverse.
    if (currentVal === null || priorVal === null || Math.sign(currentVal) !== Math.sign(priorVal)) continue;
    const change = ratioChange(ratios, t.key, currentPeriod, priorPeriod);
    if (change === null) continue;
    const adverse = t.higherBetter ? change < -0.25 : change > 0.25;
    if (!adverse) continue;
    observations.push({
      category: "Trajectory",
      statement: `${t.label} still scores within the top bands, but has moved sharply in the adverse direction period-over-period — the current score may not reflect where the trend is heading.`,
      citedFigures: [
        fig(priorPeriod, t.label, priorVal !== null ? String(priorVal.toFixed(2)) : "confirmed absent"),
        fig(currentPeriod, t.label, currentVal !== null ? String(currentVal.toFixed(2)) : "confirmed absent"),
      ],
    });
  }

  // 6. Boundary proximity — the composite sits within a few points of a different class.
  for (const threshold of [240, 180]) {
    if (Math.abs(rating.compositeScore - threshold) <= 10) {
      observations.push({
        category: "Boundary proximity",
        statement: `The composite score sits within 10 points of the ${threshold}-point class boundary — a small change in any single criterion could move the assessment into a different class.`,
        citedFigures: [
          fig("This assessment", "Composite Score", String(rating.compositeScore)),
          fig("Scorecard", "Class boundary", String(threshold)),
        ],
      });
      break;
    }
  }

  return {
    id: `commentary-${assessmentId}-${now}`,
    assessmentId,
    ratingId,
    observations,
    noObservations: observations.length === 0,
    modelVersion: MODEL_VERSION,
    promptVersion: PROMPT_VERSION,
    generatedAt: now,
    supersededAt: null,
  };
}
