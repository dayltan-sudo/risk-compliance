import type {
  ContractRequirement,
  Coverage,
  Exclusion,
  Line,
  Portfolio,
  RequirementAssessment,
  RequirementCounts,
  RequirementStatus,
} from './types';
import { DEFAULT_THRESHOLDS, TIV_COVER_LINES } from './types';
import { isWithin } from './dates';
import { toSgd } from './fx';

/** Money formatter that never depends on ICU locale data. */
export function formatSgd(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `SGD ${sign}${digits}`;
}

function policyIsActive(policyId: string, portfolio: Portfolio): boolean {
  const policy = portfolio.policies.find((p) => p.id === policyId);
  return policy !== undefined && policy.status === 'Active';
}

/**
 * Coverages that are in force at `refDate`: the policy is active and the
 * coverage's own validity window contains the date. Coverage versions are
 * excluded once superseded, which is how expired and endorsed records drop out.
 */
export function activeCoveragesForSite(
  siteId: string,
  portfolio: Portfolio,
  refDate: string = portfolio.config.effectiveFrom,
): Coverage[] {
  return portfolio.coverages.filter(
    (coverage) =>
      coverage.siteId === siteId &&
      isWithin(refDate, coverage.validFrom, coverage.validTo) &&
      policyIsActive(coverage.policyId, portfolio),
  );
}

export function coverageLimitSgd(
  coverage: Coverage,
  portfolio: Portfolio,
  refDate: string = portfolio.config.effectiveFrom,
): number {
  return toSgd(coverage.limitOcc, coverage.currency, portfolio.fxRates, refDate);
}

export function placedLimitSgd(
  siteId: string,
  line: Line,
  portfolio: Portfolio,
  refDate: string = portfolio.config.effectiveFrom,
): number {
  return activeCoveragesForSite(siteId, portfolio, refDate)
    .filter((coverage) => coverage.line === line)
    .reduce((total, coverage) => total + coverageLimitSgd(coverage, portfolio, refDate), 0);
}

/** Placed limit across every line at a site, in SGD. */
export function sitePlacedLimitSgd(
  siteId: string,
  portfolio: Portfolio,
  refDate: string = portfolio.config.effectiveFrom,
): number {
  return activeCoveragesForSite(siteId, portfolio, refDate).reduce(
    (total, coverage) => total + coverageLimitSgd(coverage, portfolio, refDate),
    0,
  );
}

/** Limit covering TIV (property and construction lines), in SGD. */
export function siteTivCoverSgd(
  siteId: string,
  portfolio: Portfolio,
  refDate: string = portfolio.config.effectiveFrom,
): number {
  return activeCoveragesForSite(siteId, portfolio, refDate)
    .filter((coverage) => TIV_COVER_LINES.includes(coverage.line))
    .reduce((total, coverage) => total + coverageLimitSgd(coverage, portfolio, refDate), 0);
}

function exclusionCurrency(exclusion: Exclusion, portfolio: Portfolio) {
  const coverage = portfolio.coverages.find((c) => c.id === exclusion.coverageId);
  return coverage?.currency ?? 'SGD';
}

/**
 * Exclusion override. A full exclusion for the required peril (or 'all')
 * excludes the requirement outright; a sublimit exclusion excludes it when the
 * sublimit in SGD sits below the required limit. Full exclusions win over
 * sublimits, and the first match in seed order wins, so the note is stable.
 */
export function findExclusionOverride(
  requirement: ContractRequirement,
  requiredSgd: number,
  portfolio: Portfolio,
  refDate: string = portfolio.config.effectiveFrom,
): { exclusion: Exclusion; note: string } | null {
  const candidates = portfolio.exclusions.filter(
    (exclusion) =>
      exclusion.siteId === requirement.siteId && exclusion.line === requirement.line,
  );

  for (const exclusion of candidates) {
    if (exclusion.scope !== 'full') continue;
    if (exclusion.peril !== requirement.peril && exclusion.peril !== 'all') continue;
    return {
      exclusion,
      note: `Full exclusion for peril ${exclusion.peril} on ${exclusion.line}; clause ${exclusion.clauseRef}.`,
    };
  }

  for (const exclusion of candidates) {
    if (exclusion.scope !== 'sublimit') continue;
    if (exclusion.peril !== requirement.peril) continue;
    if (exclusion.sublimit === undefined) continue;
    const sublimitSgd = toSgd(
      exclusion.sublimit,
      exclusionCurrency(exclusion, portfolio),
      portfolio.fxRates,
      refDate,
    );
    if (sublimitSgd < requiredSgd) {
      return {
        exclusion,
        note:
          `Sublimit ${formatSgd(sublimitSgd)} for peril ${exclusion.peril} is below the required ` +
          `${formatSgd(requiredSgd)}; clause ${exclusion.clauseRef}.`,
      };
    }
  }

  return null;
}

/**
 * Contract requirement test, evaluated in this order:
 * exclusion override → ratio >= 1 → ratio >= 1 - tolerance → gap.
 *
 * Ratio is `placedSgd / requiredSgd`, so the exclusion override can win even
 * when the placed limit would pass on its own.
 */
export function requirementStatus(
  requirement: ContractRequirement,
  portfolio: Portfolio,
  refDate: string = portfolio.config.effectiveFrom,
): RequirementAssessment {
  const requiredSgd = toSgd(
    requirement.requiredLimit,
    requirement.currency,
    portfolio.fxRates,
    refDate,
  );
  const placedSgd = placedLimitSgd(requirement.siteId, requirement.line, portfolio, refDate);
  const tolerance =
    requirement.tolerance ?? portfolio.config.thresholds?.atRiskTolerance ?? DEFAULT_THRESHOLDS.atRiskTolerance;
  const ratio = requiredSgd > 0 ? placedSgd / requiredSgd : 1;

  const override = findExclusionOverride(requirement, requiredSgd, portfolio, refDate);
  if (override !== null) {
    return {
      status: 'Excluded',
      ratio,
      note: override.note,
      placedSgd,
      requiredSgd,
      tolerance,
    };
  }

  let status: RequirementStatus;
  if (ratio >= 1) {
    status = 'Met';
  } else if (ratio >= 1 - tolerance) {
    status = 'At-risk';
  } else {
    status = 'Gap';
  }

  return { status, ratio, placedSgd, requiredSgd, tolerance };
}

export function requirementSummary(
  portfolio: Portfolio,
  refDate: string = portfolio.config.effectiveFrom,
): RequirementCounts {
  const counts: RequirementCounts = {
    Met: 0,
    'At-risk': 0,
    Gap: 0,
    Excluded: 0,
    total: 0,
  };
  for (const requirement of portfolio.requirements) {
    const { status } = requirementStatus(requirement, portfolio, refDate);
    counts[status] += 1;
    counts.total += 1;
  }
  return counts;
}
