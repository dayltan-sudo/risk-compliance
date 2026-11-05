import { describe, expect, it } from 'vitest';
import type { Driver } from '../src/engine/types';
import { exposedLinesForSite, isSubInvestmentGrade, scoreSite } from '../src/engine/scoring';
import { portfolio } from '../src/data/portfolio';
import { m, makeCoverage, makePolicy, makePortfolio, makeSite } from './helpers';

const NO_OTHER_WEIGHTS: Record<Driver, number> = {
  coverageGap: 0,
  underinsuredTiv: 0,
  natCat: 0,
  countryRisk: 0,
  claims: 0,
  carrier: 0,
  emerging: 0,
  mandatory: 0,
};

function driverOf(result: ReturnType<typeof scoreSite>, driver: Driver) {
  const found = result.drivers.find((candidate) => candidate.driver === driver);
  if (found === undefined) throw new Error(`No driver ${driver}`);
  return found;
}

describe('scoreSite — bounds', () => {
  it('scores a fully covered, zero-index site at 0 / Low', () => {
    const clean = makePortfolio();
    const result = scoreSite(clean.sites[0]!, clean);
    expect(result.score).toBe(0);
    expect(result.band).toBe('Low');
    for (const driver of result.drivers) {
      expect(driver.subScore).toBe(0);
    }
  });

  it('scores a fully uninsured site with all indices at 100 as 100 / Critical', () => {
    const exposed = makePortfolio({
      sites: [
        makeSite({
          natCatIndex: 100,
          countryRiskIndex: 100,
          claimsIndex: 100,
        }),
      ],
      policies: [],
      coverages: [],
    });
    const result = scoreSite(exposed.sites[0]!, exposed);
    expect(result.score).toBe(100);
    expect(result.band).toBe('Critical');
    for (const driver of result.drivers) {
      // `emerging` is structurally 0 in this prototype: there is no news feed.
      expect(driver.subScore).toBe(driver.driver === 'emerging' ? 0 : 100);
    }
  });

  it('raises the score when the coverageGap weight is raised', () => {
    const gapHeavySite = makePortfolio({
      coverages: [makeCoverage({ sumInsured: m(40), limitOcc: m(40) })],
    });
    const site = gapHeavySite.sites[0]!;

    const lowGapWeight = scoreSite(site, gapHeavySite, {
      weights: { ...NO_OTHER_WEIGHTS, coverageGap: 0.2, underinsuredTiv: 0.8 },
    });
    const highGapWeight = scoreSite(site, gapHeavySite, {
      weights: { ...NO_OTHER_WEIGHTS, coverageGap: 0.8, underinsuredTiv: 0.2 },
    });

    expect(driverOf(highGapWeight, 'coverageGap').subScore).toBe(100);
    expect(highGapWeight.score).toBeGreaterThan(lowGapWeight.score);
  });

  it('normalises weights over the non-zero drivers', () => {
    const result = scoreSite(portfolio.sites[0]!, portfolio);
    const totalWeight = result.drivers.reduce((total, driver) => total + driver.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 10);
    expect(driverOf(result, 'emerging').weight).toBe(0);
    expect(result.drivers.reduce((total, driver) => total + driver.contribution, 0)).toBeCloseTo(
      result.score,
      1,
    );
  });
});

describe('scoreSite — drivers', () => {
  it('measures the carrier share held by sub-investment-grade insurers', () => {
    const mixed = makePortfolio({
      carriers: [
        { id: 'car-good', name: 'Good Re', rating: 'AA-', ratingDate: '2026-01-01' },
        { id: 'car-sub', name: 'Sub Re', rating: 'BB+', ratingDate: '2026-01-01' },
      ],
      policies: [
        makePolicy({ id: 'pol-good', carrierId: 'car-good' }),
        makePolicy({ id: 'pol-sub', carrierId: 'car-sub' }),
      ],
      coverages: [
        makeCoverage({ id: 'cov-good', policyId: 'pol-good', limitOcc: m(50) }),
        makeCoverage({ id: 'cov-sub', policyId: 'pol-sub', limitOcc: m(50) }),
      ],
    });
    const result = scoreSite(mixed.sites[0]!, mixed);
    expect(driverOf(result, 'carrier').subScore).toBe(50);
  });

  it('flags a missing exposed line through the mandatory driver', () => {
    const dataCentre = makePortfolio({
      sites: [makeSite({ assetClass: 'Data Centre' })],
      coverages: [makeCoverage({ limitOcc: m(100) })],
    });
    const result = scoreSite(dataCentre.sites[0]!, dataCentre);
    expect(exposedLinesForSite(dataCentre.sites[0]!, dataCentre)).toContain('Cyber');
    expect(driverOf(result, 'mandatory').subScore).toBe(100);
  });

  it('does not flag mandatory risk when every exposed line is placed', () => {
    const dataCentre = makePortfolio({
      sites: [makeSite({ assetClass: 'Data Centre' })],
      policies: [makePolicy(), makePolicy({ id: 'pol-cyber', line: 'Cyber' })],
      coverages: [
        makeCoverage({ limitOcc: m(100) }),
        makeCoverage({
          id: 'cov-cyber',
          policyId: 'pol-cyber',
          line: 'Cyber',
          sumInsured: m(10),
          limitOcc: m(10),
        }),
      ],
    });
    const result = scoreSite(dataCentre.sites[0]!, dataCentre);
    expect(driverOf(result, 'mandatory').subScore).toBe(0);
  });

  it('keeps emerging at zero because there is no news feed in this prototype', () => {
    const result = scoreSite(portfolio.sites[0]!, portfolio);
    expect(driverOf(result, 'emerging').subScore).toBe(0);
  });
});

describe('scoreSite — seed showcase', () => {
  it('scores Hai Phong Yard Critical and Alexandra Point Low', () => {
    const haiPhong = portfolio.sites.find((site) => site.id === 'site-08');
    const alexandra = portfolio.sites.find((site) => site.id === 'site-11');
    if (haiPhong === undefined || alexandra === undefined) throw new Error('Missing showcase site');

    const critical = scoreSite(haiPhong, portfolio);
    expect(critical.band).toBe('Critical');
    expect(critical.score).toBeGreaterThanOrEqual(85);

    const low = scoreSite(alexandra, portfolio);
    expect(low.band).toBe('Low');
    expect(low.score).toBeLessThan(40);
  });
});

describe('isSubInvestmentGrade', () => {
  it('treats BB and below as sub-investment-grade', () => {
    expect(isSubInvestmentGrade('BBB+')).toBe(false);
    expect(isSubInvestmentGrade('BBB-')).toBe(false);
    expect(isSubInvestmentGrade('A')).toBe(false);
    expect(isSubInvestmentGrade('BB+')).toBe(true);
    expect(isSubInvestmentGrade('BB')).toBe(true);
    expect(isSubInvestmentGrade('BB-')).toBe(true);
    expect(isSubInvestmentGrade('B+')).toBe(true);
    expect(isSubInvestmentGrade('CCC')).toBe(true);
  });
});
