import type {
  GroupSummary,
  Hotspot,
  Portfolio,
  RenewalBuckets,
} from './types';
import { addDays } from './dates';
import { toSgd } from './fx';
import {
  requirementSummary,
  siteTivCoverSgd,
} from './requirements';
import { round2, scoreSite } from './scoring';

/**
 * Active policies expiring within 30, 60 and 90 days of `asOf`. Buckets are
 * cumulative, so d30 <= d60 <= d90 by construction. A policy expiring exactly
 * on `asOf` is already at its expiry date and is not counted as a renewal.
 */
export function renewalBuckets(
  portfolio: Portfolio,
  asOf: string = portfolio.config.effectiveFrom,
): RenewalBuckets {
  const buckets: RenewalBuckets = { d30: 0, d60: 0, d90: 0 };
  const d30 = addDays(asOf, 30);
  const d60 = addDays(asOf, 60);
  const d90 = addDays(asOf, 90);

  for (const policy of portfolio.policies) {
    if (policy.status !== 'Active') continue;
    if (policy.expiry <= asOf) continue;
    if (policy.expiry <= d30) buckets.d30 += 1;
    if (policy.expiry <= d60) buckets.d60 += 1;
    if (policy.expiry <= d90) buckets.d90 += 1;
  }

  return buckets;
}

/**
 * Group roll-up. `asOf` drives the renewal windows only; all money is valued at
 * `portfolio.config.effectiveFrom` so the same figure can be reproduced from
 * the config row alone.
 *
 * `insuredSgd` is the TIV-weighted numerator of `adequacyPct`:
 * sum over sites of min(property limit, TIV), capped per site.
 */
export function groupSummary(
  portfolio: Portfolio,
  asOf: string = portfolio.config.effectiveFrom,
): GroupSummary {
  const valuationDate = portfolio.config.effectiveFrom;
  const policiesById = new Map(portfolio.policies.map((policy) => [policy.id, policy]));

  let tivSgd = 0;
  let insuredSgd = 0;
  for (const site of portfolio.sites) {
    tivSgd += site.tivSgd;
    insuredSgd += Math.min(siteTivCoverSgd(site.id, portfolio, valuationDate), site.tivSgd);
  }

  const adequacyPct = tivSgd > 0 ? Math.min(100, (insuredSgd / tivSgd) * 100) : 0;

  const counts = requirementSummary(portfolio, valuationDate);

  const scored = portfolio.sites.map((site) => {
    const result = scoreSite(site, portfolio);
    return {
      siteId: site.id,
      siteName: site.name,
      entityId: site.entityId,
      score: result.score,
      band: result.band,
    };
  });
  scored.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.siteName < b.siteName ? -1 : a.siteName > b.siteName ? 1 : 0,
  );
  const hotspots: Hotspot[] = scored.slice(0, 5);

  let premiumSgd = 0;
  for (const premium of portfolio.premiums) {
    const policy = policiesById.get(premium.policyId);
    if (policy === undefined || policy.status !== 'Active') continue;
    premiumSgd += toSgd(premium.gross, premium.currency, portfolio.fxRates, valuationDate);
  }

  return {
    tivSgd: round2(tivSgd),
    insuredSgd: round2(insuredSgd),
    adequacyPct: round2(adequacyPct),
    openGaps: counts.Gap,
    atRisk: counts['At-risk'],
    excluded: counts.Excluded,
    renewals: renewalBuckets(portfolio, asOf),
    hotspots,
    premiumSgd: round2(premiumSgd),
    requirementCounts: counts,
  };
}
