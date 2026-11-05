import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { portfolio } from '../src/data/portfolio';
import { mulberry32 } from '../src/data/prng';
import { isIsoDate } from '../src/engine/dates';

const ROOT = new URL('..', import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

describe('seed volume', () => {
  it('matches the contracted record counts', () => {
    expect(portfolio.entities).toHaveLength(8);
    expect(portfolio.sites).toHaveLength(14);
    expect(portfolio.assets).toHaveLength(40);
    expect(portfolio.policies).toHaveLength(30);
    expect(portfolio.requirements).toHaveLength(18);
    expect(portfolio.exclusions).toHaveLength(11);
    expect(portfolio.fxRates).toHaveLength(12);
  });

  it('uses unique ids in every collection', () => {
    for (const collection of [
      portfolio.entities,
      portfolio.sites,
      portfolio.assets,
      portfolio.carriers,
      portfolio.brokers,
      portfolio.policies,
      portfolio.coverages,
      portfolio.premiums,
      portfolio.requirements,
      portfolio.exclusions,
    ]) {
      const ids = collection.map((record) => record.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('has unique policy numbers', () => {
    const numbers = portfolio.policies.map((policy) => policy.policyNo);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe('seed referential integrity', () => {
  it('resolves every foreign key', () => {
    const entityIds = new Set(portfolio.entities.map((entity) => entity.id));
    const siteIds = new Set(portfolio.sites.map((site) => site.id));
    const assetIds = new Set(portfolio.assets.map((asset) => asset.id));
    const carrierIds = new Set(portfolio.carriers.map((carrier) => carrier.id));
    const brokerIds = new Set(portfolio.brokers.map((broker) => broker.id));
    const policyIds = new Set(portfolio.policies.map((policy) => policy.id));
    const coverageIds = new Set(portfolio.coverages.map((coverage) => coverage.id));

    for (const site of portfolio.sites) expect(entityIds.has(site.entityId)).toBe(true);
    for (const asset of portfolio.assets) expect(siteIds.has(asset.siteId)).toBe(true);
    for (const policy of portfolio.policies) {
      expect(entityIds.has(policy.entityId)).toBe(true);
      expect(carrierIds.has(policy.carrierId)).toBe(true);
      expect(brokerIds.has(policy.brokerId)).toBe(true);
    }
    for (const coverage of portfolio.coverages) {
      expect(policyIds.has(coverage.policyId)).toBe(true);
      expect(siteIds.has(coverage.siteId)).toBe(true);
    }
    for (const premium of portfolio.premiums) expect(policyIds.has(premium.policyId)).toBe(true);
    for (const requirement of portfolio.requirements) {
      expect(assetIds.has(requirement.assetId)).toBe(true);
      expect(siteIds.has(requirement.siteId)).toBe(true);
    }
    for (const exclusion of portfolio.exclusions) {
      expect(coverageIds.has(exclusion.coverageId)).toBe(true);
      expect(siteIds.has(exclusion.siteId)).toBe(true);
    }
  });

  it('keeps each coverage on the same site and line as its policy', () => {
    for (const coverage of portfolio.coverages) {
      const policy = portfolio.policies.find((candidate) => candidate.id === coverage.policyId);
      expect(policy).toBeDefined();
      expect(policy?.line).toBe(coverage.line);
      const policySites = portfolio.coverages.filter((c) => c.policyId === policy?.id);
      expect(policySites.length).toBeGreaterThan(0);
    }
  });

  it('keeps every coverage currency on the policy currency', () => {
    for (const coverage of portfolio.coverages) {
      const policy = portfolio.policies.find((candidate) => candidate.id === coverage.policyId);
      expect(policy?.currency).toBe(coverage.currency);
    }
  });

  it('stores every date as an ISO YYYY-MM-DD string', () => {
    const dates = [
      ...portfolio.policies.flatMap((policy) => [policy.inception, policy.expiry]),
      ...portfolio.coverages.flatMap((coverage) => [
        coverage.validFrom,
        ...(coverage.validTo === null ? [] : [coverage.validTo]),
      ]),
      ...portfolio.assets.map((asset) => asset.valuationDate),
      ...portfolio.carriers.map((carrier) => carrier.ratingDate),
      ...portfolio.fxRates.map((rate) => rate.date),
    ];
    for (const value of dates) expect(isIsoDate(value)).toBe(true);
  });
});

describe('determinism', () => {
  it('mulberry32 produces the same stream for the same seed', () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    const a = [first(), first(), first(), first(), first()];
    const b = [second(), second(), second(), second(), second()];
    expect(a).toEqual(b);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(a).not.toEqual([a[1], a[0], a[2], a[3], a[4]]);
  });

  it('a different seed produces a different stream', () => {
    const first = mulberry32(42);
    const other = mulberry32(43);
    expect(first()).not.toBe(other());
  });

  it('keeps asset values inside their site TIV and stable', () => {
    const totals = new Map<string, number>();
    for (const asset of portfolio.assets) {
      expect(asset.declaredValueSgd).toBeGreaterThan(0);
      totals.set(asset.siteId, (totals.get(asset.siteId) ?? 0) + asset.declaredValueSgd);
    }
    for (const site of portfolio.sites) {
      // Rounding per asset may move the sum by a few dollars, never by more.
      expect((totals.get(site.id) ?? 0) - site.tivSgd).toBeLessThanOrEqual(20);
      expect(site.tivSgd - (totals.get(site.id) ?? 0)).toBeLessThanOrEqual(20);
    }
  });

  it('does not call Math.random anywhere in src', () => {
    const offenders = sourceFiles(join(ROOT, 'src')).filter((file) =>
      /Math\.random\s*\(/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
