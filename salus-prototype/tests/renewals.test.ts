import { describe, expect, it } from 'vitest';

import { portfolio } from '../src/data/portfolio';
import { bucketFor, buildRenewalRows, filterByWindow } from '../src/app/pages/Renewals';

/**
 * The renewal register answers "which policies expire, soonest first". The sort
 * and the window arithmetic are the whole feature, so they are tested against
 * the real seed rather than fixtures.
 */

const AS_OF = portfolio.config.effectiveFrom;

describe('bucketFor', () => {
  it('places days left in the right window', () => {
    expect(bucketFor(-1)).toBe('expired');
    expect(bucketFor(0)).toBe('d30');
    expect(bucketFor(30)).toBe('d30');
    expect(bucketFor(31)).toBe('d60');
    expect(bucketFor(60)).toBe('d60');
    expect(bucketFor(61)).toBe('d90');
    expect(bucketFor(90)).toBe('d90');
    expect(bucketFor(91)).toBe('later');
  });
});

describe('buildRenewalRows', () => {
  const rows = buildRenewalRows(portfolio, AS_OF);

  it('covers every policy in the portfolio', () => {
    expect(rows).toHaveLength(portfolio.policies.length);
  });

  it('puts active policies before expired ones', () => {
    const firstExpired = rows.findIndex((row) => row.bucket === 'expired');
    if (firstExpired === -1) return; // no expired policies in the seed

    expect(rows.slice(firstExpired).every((row) => row.bucket === 'expired')).toBe(true);
  });

  it('orders active policies by soonest expiry', () => {
    const active = rows.filter((row) => row.bucket !== 'expired');
    const days = active.map((row) => row.daysLeft);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it('counts days from the valuation date', () => {
    const soonest = rows.find((row) => row.bucket === 'd30');
    expect(soonest).toBeDefined();
    expect(soonest?.daysLeft).toBeGreaterThanOrEqual(0);
    expect(soonest?.daysLeft).toBeLessThanOrEqual(30);
  });

  it('resolves the entity, carrier and covered sites', () => {
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;

    expect(row.entityName).not.toBe(row.policy.entityId);
    expect(row.carrierName).not.toBe(row.policy.carrierId);
    expect(row.siteNames.length).toBeGreaterThan(0);
  });
});

describe('filterByWindow', () => {
  const rows = buildRenewalRows(portfolio, AS_OF);

  it('treats the windows as cumulative', () => {
    const d30 = filterByWindow(rows, 'd30');
    const d60 = filterByWindow(rows, 'd60');
    const d90 = filterByWindow(rows, 'd90');

    expect(d30.length).toBeLessThanOrEqual(d60.length);
    expect(d60.length).toBeLessThanOrEqual(d90.length);
  });

  it('keeps expired policies out of the active view', () => {
    expect(filterByWindow(rows, 'all').every((row) => row.bucket !== 'expired')).toBe(true);
    expect(filterByWindow(rows, 'expired').every((row) => row.bucket === 'expired')).toBe(true);
  });
});
