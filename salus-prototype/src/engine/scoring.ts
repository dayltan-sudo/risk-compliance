import type {
  Band,
  Coverage,
  Driver,
  DriverScore,
  Line,
  Portfolio,
  Site,
  SiteScore,
  Thresholds,
} from './types';
import { DEFAULT_THRESHOLDS, DRIVERS } from './types';
import { coverageGapPct } from './ratios';
import {
  activeCoveragesForSite,
  coverageLimitSgd,
  placedLimitSgd,
  siteTivCoverSgd,
} from './requirements';

/**
 * Lines a site is structurally exposed to, by asset class. Contract
 * requirements are added on top: if a counterparty demands a line, the site is
 * exposed to it whether or not the asset-class table says so.
 */
const ASSET_CLASS_EXPOSURE: Record<string, Line[]> = {
  'Data Centre': ['Property & BI', 'Cyber'],
  'Logistics Warehouse': ['Property & BI', 'Marine Cargo'],
  'Solar Farm': ['Property & BI', 'Construction'],
  'Wind Farm': ['Property & BI', 'Construction'],
  Office: ['Property & BI', 'Directors & Officers'],
  'Port Terminal': ['Property & BI', 'Marine Cargo', 'Construction'],
  'Fabrication Yard': ['Property & BI', 'Marine Hull', "Workmen's Compensation"],
  'Marine Base': ['Property & BI', 'Marine Hull', 'Motor Fleet'],
};

export function exposedLinesForSite(site: Site, portfolio: Portfolio): Line[] {
  const base = ASSET_CLASS_EXPOSURE[site.assetClass] ?? ['Property & BI'];
  const required = portfolio.requirements
    .filter((requirement) => requirement.siteId === site.id)
    .map((requirement) => requirement.line);

  const lines: Line[] = [];
  for (const line of [...base, ...required]) {
    if (!lines.includes(line)) lines.push(line);
  }
  return lines;
}

/**
 * Ratings at or below BB are sub-investment-grade. 'BBB' is explicitly excluded
 * before the BB prefix test, and unrated carriers are not counted (the rating
 * rule is what the demo shows; unrated would need its own driver).
 */
export function isSubInvestmentGrade(rating: string): boolean {
  const normalised = rating.trim().toUpperCase();
  if (normalised === '' || normalised.startsWith('BBB')) return false;
  return /^(BB|B|CCC|CC|C|D)/.test(normalised);
}

function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function carrierSubScore(
  coverages: Coverage[],
  portfolio: Portfolio,
  refDate: string,
): number {
  const carriersById = new Map(portfolio.carriers.map((carrier) => [carrier.id, carrier]));
  const policiesById = new Map(portfolio.policies.map((policy) => [policy.id, policy]));

  let placed = 0;
  let subInvestmentGrade = 0;
  for (const coverage of coverages) {
    const limitSgd = coverageLimitSgd(coverage, portfolio, refDate);
    placed += limitSgd;
    const policy = policiesById.get(coverage.policyId);
    const carrier = policy === undefined ? undefined : carriersById.get(policy.carrierId);
    if (carrier !== undefined && isSubInvestmentGrade(carrier.rating)) {
      subInvestmentGrade += limitSgd;
    }
  }

  if (placed <= 0) {
    // Nothing placed means no investment-grade carrier is supporting the risk.
    return 100;
  }
  return (subInvestmentGrade / placed) * 100;
}

export type ScoreOptions = {
  weights?: Partial<Record<Driver, number>>;
  thresholds?: Thresholds;
};

/**
 * Site risk score: eight 0-100 sub-scores, then a weighted sum with weights
 * normalised over the non-zero drivers. `emerging` is 0 in this prototype
 * (no news feed) and its weight can therefore be set to 0 without the remaining
 * weights failing to sum to 1.
 */
export function scoreSite(site: Site, portfolio: Portfolio, options: ScoreOptions = {}): SiteScore {
  const refDate = portfolio.config.effectiveFrom;
  const thresholds = options.thresholds ?? portfolio.config.thresholds ?? DEFAULT_THRESHOLDS;
  const coverages = activeCoveragesForSite(site.id, portfolio, refDate);

  const tiv = site.tivSgd;
  const tivCover = siteTivCoverSgd(site.id, portfolio, refDate);
  const gap = coverageGapPct(tiv, tivCover);
  const underinsured = tiv > 0 ? 100 * (1 - Math.min(tivCover, tiv) / tiv) : 0;

  const exposedLines = exposedLinesForSite(site, portfolio);
  const missingLine = exposedLines.some(
    (line) => placedLimitSgd(site.id, line, portfolio, refDate) <= 0,
  );

  const subScores: Record<Driver, number> = {
    coverageGap: clamp(Math.min(100, gap.value * 200)),
    underinsuredTiv: clamp(underinsured),
    natCat: clamp(site.natCatIndex),
    countryRisk: clamp(site.countryRiskIndex),
    claims: clamp(site.claimsIndex),
    carrier: clamp(carrierSubScore(coverages, portfolio, refDate)),
    emerging: 0,
    mandatory: missingLine ? 100 : 0,
  };

  const weights: Record<Driver, number> = {
    ...portfolio.config.weights,
    ...(options.weights ?? {}),
  };

  const totalWeight = DRIVERS.reduce(
    (total, driver) => total + Math.max(0, weights[driver] ?? 0),
    0,
  );

  const drivers: DriverScore[] = DRIVERS.map((driver) => {
    const raw = Math.max(0, weights[driver] ?? 0);
    const weight = totalWeight > 0 ? raw / totalWeight : 0;
    return {
      driver,
      subScore: round2(subScores[driver]),
      weight,
      contribution: round2(subScores[driver] * weight),
    };
  });

  const score = clamp(round2(drivers.reduce((total, driver) => total + driver.contribution, 0)));
  const band: Band =
    score < thresholds.bandMedium
      ? 'Low'
      : score < thresholds.bandHigh
        ? 'Medium'
        : score < thresholds.bandCritical
          ? 'High'
          : 'Critical';

  return { score, band, drivers };
}
