import type { CriterionDriver, CriterionInput, CriterionNumberAll, ExtractedField, Rating, RatingClass, RelationshipType, Ratio } from "../types";
import { RATING_CLASSES, SCORECARD, SCORECARD_VERSION } from "../data/config";

// FR6 — Rating Engine (Calculation module, Scoring & Decisioning.md Flow B).
// Deterministic band-mapping against the closed FR6.7 scorecard — no
// reweighting, no exclusion. An absent input scores tier 1 (FR6.5); it is
// never dropped from the composite.

function weightFor(n: CriterionNumberAll, relationshipType: RelationshipType): number {
  const def = SCORECARD[n];
  return relationshipType === "New" ? def.weightNew : def.weightRenewal;
}

function tierForIntervalRatio(ratio: Ratio | undefined, criterionNumber: CriterionNumberAll): { tier: 1 | 2 | 3; sourceInput: string } {
  const def = SCORECARD[criterionNumber];
  if (def.band.kind !== "interval") throw new Error(`criterion ${criterionNumber} is not an interval band`);
  if (!ratio || ratio.notCalculableReason) {
    return { tier: 1, sourceInput: ratio?.notCalculableReason ?? "Not calculable — input missing" };
  }
  if (ratio.zeroDivisorTierApplied !== null) {
    return { tier: ratio.zeroDivisorTierApplied, sourceInput: `— (zero divisor: ${ratio.zeroDivisorField}, tier ${ratio.zeroDivisorTierApplied} applied per FR4.12)` };
  }
  const x = ratio.valueNumeric as number;
  const tier = x >= def.band.tier3Min ? 3 : x >= def.band.tier2Min ? 2 : 1;
  return { tier, sourceInput: `${def.label} = ${formatForDisplay(x, def.band.displayHint)}` };
}

function tierForDebtToEquity(ratio: Ratio | undefined): { tier: 1 | 2 | 3; sourceInput: string; tierOneCondition: "high_leverage" | "negative_equity" | "zero_equity" | null } {
  if (!ratio || ratio.notCalculableReason) {
    return { tier: 1, sourceInput: ratio?.notCalculableReason ?? "Not calculable — input missing", tierOneCondition: null };
  }
  if (ratio.zeroDivisorTierApplied !== null) {
    // FR4.12/FR6.10 — no equity buffer, a distinct route from the negative-equity band case below.
    return { tier: ratio.zeroDivisorTierApplied, sourceInput: "— (zero divisor: Total Equity, tier 1 applied per FR4.12)", tierOneCondition: "zero_equity" };
  }
  const x = ratio.valueNumeric as number;
  if (x > 0 && x <= 1) return { tier: 3, sourceInput: `Debt to Equity = ${x.toFixed(2)}x`, tierOneCondition: null };
  if (x > 1 && x < 2) return { tier: 2, sourceInput: `Debt to Equity = ${x.toFixed(2)}x`, tierOneCondition: null };
  return { tier: 1, sourceInput: `Debt to Equity = ${x.toFixed(2)}x`, tierOneCondition: x <= 0 ? "negative_equity" : "high_leverage" };
}

/** FR6.13 — the four NPAT sign combinations, three tiers, none unassigned.
 * Recent performance dominates: a current-period loss is tier 1 whatever the
 * prior period did, including an absent prior. */
function tierForProfitabilityHistory(ratio: Ratio | undefined): { tier: 1 | 2 | 3; sourceInput: string } {
  if (!ratio || ratio.notCalculableReason || !ratio.signPair || ratio.signPair.currentPositive === null) {
    return { tier: 1, sourceInput: ratio?.notCalculableReason ?? "Not calculable — current-period NPAT missing" };
  }
  const { currentPositive, priorPositive } = ratio.signPair;
  if (!currentPositive) return { tier: 1, sourceInput: "Latest period: loss (whatever the prior period did)" };
  if (priorPositive) return { tier: 3, sourceInput: "Both periods profitable" };
  return { tier: 2, sourceInput: "Latest period profitable, prior not (or prior absent)" };
}

function formatForDisplay(x: number, hint: "pct" | "x" | "years"): string {
  if (hint === "pct") return `${(x * 100).toFixed(1)}%`;
  if (hint === "years") return `${x.toFixed(1)} yrs`;
  return `${x.toFixed(2)}x`;
}

function findRatio(ratios: Ratio[], key: Ratio["ratioKey"], period: string | null): Ratio | undefined {
  return ratios.find((r) => r.ratioKey === key && r.period === period);
}

/** FR6.1–FR6.14 — band-maps all eleven criteria, applies the weight set
 * selected by relationshipType, and sums the composite. Precondition: every
 * ratio/criterion input passed in already reflects Confirmed/Amended data
 * (FR3.8) — this engine never reads an Unconfirmed value. */
export function computeRating(
  assessmentId: string,
  ratios: Ratio[],
  criterionInputs: CriterionInput[],
  fields: ExtractedField[],
  currentPeriod: string,
  relationshipType: RelationshipType,
  now: string,
): Rating {
  const drivers: CriterionDriver[] = [];

  // Criteria 1, 2, 3, 5, 7 — interval bands.
  const c1 = tierForIntervalRatio(findRatio(ratios, "wc_over_revenue", currentPeriod), 1);
  drivers.push(makeDriver(1, c1.tier, c1.sourceInput, relationshipType));

  const c2 = tierForIntervalRatio(findRatio(ratios, "current_ratio", currentPeriod), 2);
  drivers.push(makeDriver(2, c2.tier, c2.sourceInput, relationshipType));

  const c3 = tierForIntervalRatio(findRatio(ratios, "net_profit_margin", currentPeriod), 3);
  drivers.push(makeDriver(3, c3.tier, c3.sourceInput, relationshipType));

  // Criterion 4 — debt to equity, its own band shape (FR6.10).
  const c4 = tierForDebtToEquity(findRatio(ratios, "debt_to_equity", currentPeriod));
  drivers.push({ ...makeDriver(4, c4.tier, c4.sourceInput, relationshipType), tierOneCondition: c4.tierOneCondition });

  const c5 = tierForIntervalRatio(findRatio(ratios, "paid_up_capital_cover", null), 5);
  drivers.push(makeDriver(5, c5.tier, c5.sourceInput, relationshipType));

  // Criterion 6 — profitability history (FR6.13).
  const c6 = tierForProfitabilityHistory(findRatio(ratios, "profitability_history", null));
  drivers.push(makeDriver(6, c6.tier, c6.sourceInput, relationshipType));

  const c7 = tierForIntervalRatio(findRatio(ratios, "years_established", null), 7);
  drivers.push(makeDriver(7, c7.tier, c7.sourceInput, relationshipType));

  // Criterion 8 — litigation record. Binary (FR6.4), categorical, from CriterionInput.
  const in8 = criterionInputs.find((c) => c.criterionNumber === 8);
  const tier8 = !in8 || !in8.litigationRecord ? 1 : in8.litigationRecord === "Other record" ? 1 : 3;
  drivers.push(makeDriver(8, tier8, in8?.litigationRecord ?? "Confirmed absent", relationshipType));

  // Criterion 9 — change in directors. Binary.
  const in9 = criterionInputs.find((c) => c.criterionNumber === 9);
  const tier9 = !in9 || in9.changeInDirectors === null ? 1 : in9.changeInDirectors ? 1 : 3;
  drivers.push(makeDriver(9, tier9, in9?.changeInDirectors === null || in9?.changeInDirectors === undefined ? "Confirmed absent" : in9.changeInDirectors ? "Yes" : "No", relationshipType));

  // Criterion 10 — positive net operating cash flow, latest period only. Binary.
  const cfField = fields.find((f) => f.period === currentPeriod && f.fieldName === "Net Operating Cash Flow Positive");
  const tier10 = !cfField || typeof cfField.value !== "boolean" ? 1 : cfField.value ? 3 : 1;
  drivers.push(makeDriver(10, tier10, !cfField || typeof cfField.value !== "boolean" ? "Confirmed absent" : cfField.value ? "Positive" : "Not positive", relationshipType));

  // Criterion 11 — prompt payment record. Zero weight for New (FR6.6) — still
  // evaluated explicitly, never left as an unevaluated branch.
  const in11 = criterionInputs.find((c) => c.criterionNumber === 11);
  const tier11 =
    relationshipType === "New"
      ? 1 // sentinel — weight is 0, so this value never contributes to the composite
      : !in11 || !in11.promptPaymentRecord
        ? 1
        : in11.promptPaymentRecord === "Good"
          ? 3
          : 1;
  const source11 = relationshipType === "New" ? "Not collected for New customers (FR5.5)" : (in11?.promptPaymentRecord ?? "Confirmed absent");
  drivers.push(makeDriver(11, tier11, source11, relationshipType));

  drivers.sort((a, b) => a.criterionNumber - b.criterionNumber);
  const compositeScore = drivers.reduce((sum, d) => sum + d.contribution, 0);
  const band = RATING_CLASSES.find((b) => compositeScore >= b.min && compositeScore <= b.max);
  const ratingClass: RatingClass = band?.ratingClass ?? "C";

  return {
    id: `rating-${assessmentId}`,
    assessmentId,
    compositeScore,
    ratingClass,
    handlingRoute: band?.handlingRoute ?? RATING_CLASSES[RATING_CLASSES.length - 1].handlingRoute,
    weightSet: relationshipType === "New" ? "new" : "renewal",
    driverBreakdown: drivers,
    scorecardVersion: SCORECARD_VERSION,
    computedAt: now,
  };
}

function makeDriver(criterionNumber: CriterionNumberAll, tier: 1 | 2 | 3, sourceInput: string, relationshipType: RelationshipType): CriterionDriver {
  const weight = weightFor(criterionNumber, relationshipType);
  return {
    criterionNumber,
    label: SCORECARD[criterionNumber].label,
    tier,
    weight,
    contribution: tier * weight,
    sourceInput,
    tierOneCondition: null,
  };
}
