import { describe, expect, it } from 'vitest';
import type { ContractRequirement, Portfolio } from '../src/engine/types';
import {
  placedLimitSgd,
  requirementStatus,
  requirementSummary,
} from '../src/engine/requirements';
import { portfolio } from '../src/data/portfolio';
import { m, makeCoverage, makePolicy, makePortfolio, makeRequirement, makeSite } from './helpers';

function requirementById(id: string, source: Portfolio = portfolio): ContractRequirement {
  const requirement = source.requirements.find((candidate) => candidate.id === id);
  if (requirement === undefined) throw new Error(`No requirement ${id}`);
  return requirement;
}

describe('requirementStatus — seeded showcase cases', () => {
  it('req-01: cyber at a tenant-leased DC is Excluded by a sublimit below the required limit', () => {
    const result = requirementStatus(requirementById('req-01'), portfolio);
    expect(result.status).toBe('Excluded');
    expect(result.placedSgd).toBe(m(15));
    expect(result.requiredSgd).toBe(m(25));
    expect(result.ratio).toBeCloseTo(0.6, 10);
    expect(result.note).toContain('EXC-CY-11');
    expect(result.note).toContain('Ransomware');
  });

  it('req-02: 100% placed with no exclusion is Met', () => {
    const result = requirementStatus(requirementById('req-02'), portfolio);
    expect(result.status).toBe('Met');
    expect(result.ratio).toBeCloseTo(1, 10);
    expect(result.note).toBeUndefined();
  });

  it('req-03: 0.92 of required is At-risk', () => {
    const result = requirementStatus(requirementById('req-03'), portfolio);
    expect(result.status).toBe('At-risk');
    expect(result.placedSgd).toBe(m(138));
    expect(result.requiredSgd).toBe(m(150));
    expect(result.ratio).toBeCloseTo(0.92, 10);
  });

  it('req-04: 0.80 of required is Gap', () => {
    const result = requirementStatus(requirementById('req-04'), portfolio);
    expect(result.status).toBe('Gap');
    expect(result.ratio).toBeCloseTo(0.8, 10);
  });

  it('req-08: a full flood exclusion overrides an otherwise At-risk ratio', () => {
    const result = requirementStatus(requirementById('req-08'), portfolio);
    expect(result.ratio).toBeCloseTo(80 / 85, 10);
    expect(result.status).toBe('Excluded');
    expect(result.note).toContain('EXC-FL-04');
    expect(result.note).toContain('Flood');
  });

  it('req-06: a full ransomware exclusion excludes a requirement the placed limit would satisfy', () => {
    const result = requirementStatus(requirementById('req-06'), portfolio);
    expect(result.placedSgd).toBe(m(40));
    expect(result.requiredSgd).toBe(m(30));
    expect(result.ratio).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe('Excluded');
    expect(result.note).toContain('EXC-CY-44');
  });

  it('counts every status in the seed', () => {
    expect(requirementSummary(portfolio)).toEqual({
      Met: 8,
      'At-risk': 3,
      Gap: 4,
      Excluded: 3,
      total: 18,
    });
  });
});

describe('requirementStatus — exclusion precedence', () => {
  it('lets a full exclusion win over a passing ratio', () => {
    const covered = makePortfolio({
      coverages: [makeCoverage({ sumInsured: m(100), limitOcc: m(100) })],
      exclusions: [
        {
          id: 'exc-full',
          coverageId: 'cov-test',
          siteId: 'site-test',
          line: 'Property & BI',
          scope: 'full',
          peril: 'Fire',
          clauseRef: 'EXC-01',
          wordingExcerpt: 'Fire excluded.',
        },
      ],
    });
    // Ratio would be 2.0 against a 50M requirement, and still loses.
    const result = requirementStatus(makeRequirement({ requiredLimit: m(50) }), covered);
    expect(result.ratio).toBeCloseTo(2, 10);
    expect(result.status).toBe('Excluded');
    expect(result.note).toContain('EXC-01');
  });

  it('treats a full exclusion with peril "all" as excluding every peril on the line', () => {
    const covered = makePortfolio({
      exclusions: [
        {
          id: 'exc-all',
          coverageId: 'cov-test',
          siteId: 'site-test',
          line: 'Property & BI',
          scope: 'full',
          peril: 'all',
          clauseRef: 'EXC-ALL-1',
          wordingExcerpt: 'All perils excluded.',
        },
      ],
    });
    const result = requirementStatus(makeRequirement({ peril: 'Flood' }), covered);
    expect(result.status).toBe('Excluded');
    expect(result.note).toContain('EXC-ALL-1');
  });

  it('does not override on a different peril', () => {
    const covered = makePortfolio({
      exclusions: [
        {
          id: 'exc-other-peril',
          coverageId: 'cov-test',
          siteId: 'site-test',
          line: 'Property & BI',
          scope: 'sublimit',
          peril: 'Data breach',
          sublimit: m(1),
          clauseRef: 'EXC-02',
          wordingExcerpt: 'Different peril.',
        },
      ],
    });
    const result = requirementStatus(makeRequirement({ peril: 'Ransomware' }), covered);
    expect(result.ratio).toBeCloseTo(1, 10);
    expect(result.status).toBe('Met');
    expect(result.note).toBeUndefined();
  });

  it('does not override when the sublimit sits above the required limit', () => {
    const covered = makePortfolio({
      exclusions: [
        {
          id: 'exc-high-sublimit',
          coverageId: 'cov-test',
          siteId: 'site-test',
          line: 'Property & BI',
          scope: 'sublimit',
          peril: 'Fire',
          sublimit: m(120),
          clauseRef: 'EXC-03',
          wordingExcerpt: 'Sublimit above the requirement.',
        },
      ],
    });
    const result = requirementStatus(makeRequirement({ requiredLimit: m(100) }), covered);
    expect(result.status).toBe('Met');
    expect(result.note).toBeUndefined();
  });

  it('overrides when the sublimit sits below the required limit, citing clause and peril', () => {
    const covered = makePortfolio({
      exclusions: [
        {
          id: 'exc-low-sublimit',
          coverageId: 'cov-test',
          siteId: 'site-test',
          line: 'Property & BI',
          scope: 'sublimit',
          peril: 'Fire',
          sublimit: m(40),
          clauseRef: 'EXC-04',
          wordingExcerpt: 'Sublimit below the requirement.',
        },
      ],
    });
    const result = requirementStatus(makeRequirement({ requiredLimit: m(100) }), covered);
    expect(result.status).toBe('Excluded');
    expect(result.note).toContain('EXC-04');
    expect(result.note).toContain('Fire');
    expect(result.note).toContain('SGD 40,000,000');
  });

  it('ignores an exclusion on a different line at the same site', () => {
    const covered = makePortfolio({
      exclusions: [
        {
          id: 'exc-other-line',
          coverageId: 'cov-test',
          siteId: 'site-test',
          line: 'Cyber',
          scope: 'full',
          peril: 'Fire',
          clauseRef: 'EXC-05',
          wordingExcerpt: 'Other line.',
        },
      ],
    });
    expect(requirementStatus(makeRequirement(), covered).status).toBe('Met');
  });
});

describe('requirementStatus — tolerances and currency', () => {
  it('uses the requirement tolerance for the At-risk band', () => {
    const covered = makePortfolio({
      coverages: [makeCoverage({ sumInsured: m(85), limitOcc: m(85) })],
    });
    const strict = requirementStatus(makeRequirement({ requiredLimit: m(100) }), covered);
    expect(strict.status).toBe('Gap');

    const relaxed = requirementStatus(
      makeRequirement({ requiredLimit: m(100), tolerance: 0.2 }),
      covered,
    );
    expect(relaxed.status).toBe('At-risk');
    expect(relaxed.tolerance).toBe(0.2);
  });

  it('converts a non-SGD required limit to SGD before comparing', () => {
    const covered = makePortfolio({
      coverages: [makeCoverage({ sumInsured: m(70), limitOcc: m(70) })],
    });
    const result = requirementStatus(
      makeRequirement({ requiredLimit: m(50), currency: 'USD' }),
      covered,
    );
    // 50M USD at 1.35 = 67.5M SGD, against 70M placed.
    expect(result.requiredSgd).toBeCloseTo(m(67.5), 6);
    expect(result.status).toBe('Met');
  });
});

describe('placedLimitSgd', () => {
  it('sums only coverages for the requested site and line', () => {
    const covered = makePortfolio({
      sites: [makeSite(), makeSite({ id: 'site-other', name: 'Other Site' })],
      policies: [makePolicy(), makePolicy({ id: 'pol-other', policyNo: 'TEST-0002' })],
      coverages: [
        makeCoverage({ id: 'cov-a', limitOcc: m(60) }),
        makeCoverage({ id: 'cov-b', limitOcc: m(40) }),
        makeCoverage({ id: 'cov-gl', line: 'General Liability', limitOcc: m(50) }),
        makeCoverage({ id: 'cov-other', policyId: 'pol-other', siteId: 'site-other', limitOcc: m(70) }),
      ],
    });
    expect(placedLimitSgd('site-test', 'Property & BI', covered)).toBe(m(100));
    expect(placedLimitSgd('site-other', 'Property & BI', covered)).toBe(m(70));
  });

  it('ignores coverages on an expired policy', () => {
    const covered = makePortfolio({
      policies: [makePolicy({ status: 'Expired' })],
    });
    expect(placedLimitSgd('site-test', 'Property & BI', covered)).toBe(0);
    expect(requirementStatus(makeRequirement(), covered).status).toBe('Gap');
  });

  it('ignores a coverage version that ended before the reference date', () => {
    const covered = makePortfolio({
      coverages: [makeCoverage({ validTo: '2026-10-31' })],
    });
    expect(placedLimitSgd('site-test', 'Property & BI', covered)).toBe(0);
  });

  it('ignores a coverage version that starts after the reference date', () => {
    const covered = makePortfolio({
      coverages: [makeCoverage({ validFrom: '2026-12-01' })],
    });
    expect(placedLimitSgd('site-test', 'Property & BI', covered)).toBe(0);
  });
});
