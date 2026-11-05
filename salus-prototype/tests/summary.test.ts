import { describe, expect, it } from 'vitest';
import { groupSummary, renewalBuckets } from '../src/engine/summary';
import { portfolio } from '../src/data/portfolio';
import { daysBetween } from '../src/engine/dates';

describe('renewalBuckets', () => {
  it('counts the 25 / 55 / 85 day renewals as 1 / 2 / 3', () => {
    // pol-07 expires 2026-11-30, pol-09 2026-12-30, pol-13 2027-01-29.
    expect(renewalBuckets(portfolio, '2026-11-05')).toEqual({ d30: 1, d60: 2, d90: 3 });
  });

  it('recomputes when the asOf date moves', () => {
    // From 2026-12-01: pol-07 has already expired, pol-09 is 29 days out,
    // pol-13 is 59 days out.
    expect(renewalBuckets(portfolio, '2026-12-01')).toEqual({ d30: 1, d60: 2, d90: 2 });
  });

  it('does not count expired policies', () => {
    const expiredOnly = { ...portfolio, policies: portfolio.policies.filter((p) => p.status === 'Expired') };
    expect(renewalBuckets(expiredOnly, '2026-11-05')).toEqual({ d30: 0, d60: 0, d90: 0 });
  });
});

describe('groupSummary', () => {
  const summary = groupSummary(portfolio);

  it('sums site TIV into the group TIV', () => {
    const total = portfolio.sites.reduce((sum, site) => sum + site.tivSgd, 0);
    expect(summary.tivSgd).toBe(total);
  });

  it('keeps adequacy between 0 and 100 and consistent with insured TIV', () => {
    expect(summary.adequacyPct).toBeGreaterThan(0);
    expect(summary.adequacyPct).toBeLessThanOrEqual(100);
    expect(summary.insuredSgd).toBeLessThanOrEqual(summary.tivSgd);
    expect(summary.adequacyPct).toBeCloseTo((summary.insuredSgd / summary.tivSgd) * 100, 1);
  });

  it('reports the seeded requirement outcome counts', () => {
    expect(summary.requirementCounts).toEqual({
      Met: 8,
      'At-risk': 3,
      Gap: 4,
      Excluded: 3,
      total: 18,
    });
    expect(summary.openGaps).toBe(4);
    expect(summary.atRisk).toBe(3);
    expect(summary.excluded).toBe(3);
  });

  it('populates all three renewal buckets', () => {
    expect(summary.renewals.d30).toBeGreaterThan(0);
    expect(summary.renewals.d60).toBeGreaterThan(0);
    expect(summary.renewals.d90).toBeGreaterThan(0);
    expect(summary.renewals.d30).toBeLessThanOrEqual(summary.renewals.d60);
    expect(summary.renewals.d60).toBeLessThanOrEqual(summary.renewals.d90);
  });

  it('ranks hotspots by score, worst first', () => {
    expect(summary.hotspots).toHaveLength(5);
    expect(summary.hotspots[0]?.siteId).toBe('site-08');
    expect(summary.hotspots[0]?.band).toBe('Critical');
    const scores = summary.hotspots.map((hotspot) => hotspot.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it('totals active premium in SGD', () => {
    expect(summary.premiumSgd).toBeGreaterThan(0);
    const activePremium = portfolio.premiums
      .filter((premium) => {
        const policy = portfolio.policies.find((p) => p.id === premium.policyId);
        return policy?.status === 'Active';
      })
      .reduce((sum, premium) => sum + premium.gross, 0);
    // Every active premium is at least SGD 1:1, so the SGD total can never be below the raw sum.
    expect(summary.premiumSgd).toBeGreaterThanOrEqual(activePremium);
  });

  it('is deterministic across consecutive calls', () => {
    expect(groupSummary(portfolio)).toEqual(groupSummary(portfolio));
    expect(JSON.stringify(groupSummary(portfolio))).toBe(JSON.stringify(groupSummary(portfolio)));
  });

  it('honours the asOf parameter for renewal windows only', () => {
    const later = groupSummary(portfolio, '2026-12-01');
    expect(later.renewals).toEqual({ d30: 1, d60: 2, d90: 2 });
    expect(later.tivSgd).toBe(summary.tivSgd);
    expect(later.adequacyPct).toBe(summary.adequacyPct);
  });
});

describe('seed timing assumptions', () => {
  it('has active policies expiring exactly 25, 55 and 85 days after the asOf date', () => {
    const offsets = portfolio.policies
      .filter((policy) => ['pol-07', 'pol-09', 'pol-13'].includes(policy.id))
      .map((policy) => daysBetween('2026-11-05', policy.expiry));
    expect(offsets).toEqual([25, 55, 85]);
  });
});
