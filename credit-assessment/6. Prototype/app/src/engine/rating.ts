import type { Rating, RatingDriver, Ratio, ScorecardConfig } from "../types";

// FR5 — Rating/Scorecard Engine. PLACEHOLDER methodology (data/config.ts).
// Not Calculable ratio treatment is OPEN in the PRD (§5, FR3.10 cross-ref):
// this prototype excludes-and-reweights among the remaining scored ratios —
// one defensible option among several named in the PRD, not a decision.

function pointsFor(value: number, good: number, fair: number, direction: "higher-better" | "lower-better"): number {
  const isGood = direction === "higher-better" ? value >= good : value <= good;
  const isFair = direction === "higher-better" ? value >= fair : value <= fair;
  if (isGood) return 100;
  if (isFair) return 60;
  return 20;
}

export function computeRating(
  assessmentId: string,
  ratiosForMostRecentPeriod: Ratio[],
  mostRecentPeriod: string,
  config: ScorecardConfig,
  now: string,
): Rating {
  const hasProvisionalInput = ratiosForMostRecentPeriod.some((r) => r.provisionalFlag);
  const notCalculable = ratiosForMostRecentPeriod.filter((r) => r.notCalculableFlag);
  const hasNotCalculableInput = notCalculable.length > 0;

  const scoredRatios = ratiosForMostRecentPeriod.filter((r) => !r.notCalculableFlag && r.value !== null);
  const totalWeight = scoredRatios.reduce((sum, r) => sum + (config.scorecardWeights[r.ratioKey] ?? 0), 0);

  const drivers: RatingDriver[] = scoredRatios.map((r) => {
    const band = config.ratioBands[r.ratioKey];
    const rawWeight = config.scorecardWeights[r.ratioKey] ?? 0;
    // reweight so the scored subset still sums to 1.0 when some ratios are Not Calculable
    const effectiveWeight = totalWeight > 0 ? rawWeight / totalWeight : 0;
    const points = band ? pointsFor(r.value!, band.good, band.fair, band.direction) : 0;
    return {
      ratioKey: r.ratioKey,
      label: r.label,
      points,
      weight: effectiveWeight,
      contribution: points * effectiveWeight,
    };
  });

  const compositeScore = Math.round(drivers.reduce((sum, d) => sum + d.contribution, 0));
  const bandDef = [...config.gradeBands].sort((a, b) => b.minScore - a.minScore).find((b) => compositeScore >= b.minScore);

  return {
    id: `rating-${assessmentId}`,
    assessmentId,
    period: mostRecentPeriod,
    compositeScore,
    grade: bandDef?.grade ?? "D",
    band: bandDef?.band ?? "Very high risk",
    driverBreakdown: drivers.sort((a, b) => b.contribution - a.contribution),
    configVersionId: config.id,
    computedAt: now,
    hasProvisionalInput,
    hasNotCalculableInput,
  };
}
