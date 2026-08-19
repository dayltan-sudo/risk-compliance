import type { Rating, Recommendation, ScorecardConfig } from "../types";

// FR6 — Recommendation Engine. PLACEHOLDER sizing rule: revenue multiplier by
// grade (data/config.ts). Whether the real basis is also exposure/appetite-based
// is OPEN in the PRD (§5) — out of scope for this prototype's illustrative config.
//
// FR3.10: "never pass a Provisional rating to the Recommendation Engine" —
// returns null when the rating carries a Provisional input; the caller must
// not present a proposal in that state.
export function computeRecommendation(
  assessmentId: string,
  rating: Rating,
  mostRecentPeriodRevenue: number,
  currency: string,
  config: ScorecardConfig,
): Recommendation | null {
  if (rating.hasProvisionalInput) return null;

  const rule = config.limitRules.find((r) => r.grade === rating.grade) ?? config.limitRules[config.limitRules.length - 1];
  const systemProposedLimit = Math.round((mostRecentPeriodRevenue * rule.limitMultiplierOfRevenue) / 1000) * 1000;

  return {
    id: `rec-${assessmentId}`,
    assessmentId,
    systemProposedLimit,
    systemProposedTermsDays: rule.termsDays,
    proposedLimit: systemProposedLimit,
    proposedTermsDays: rule.termsDays,
    overrideFlag: false,
    overrideJustification: null,
    configVersionId: config.id,
    effectiveDate: null,
    currency,
  };
}
