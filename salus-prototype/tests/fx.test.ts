import { describe, expect, it } from 'vitest';
import type { Currency } from '../src/engine/types';
import { fxRate, toSgd } from '../src/engine/fx';
import { portfolio } from '../src/data/portfolio';

const fx = portfolio.fxRates;

describe('toSgd', () => {
  it('uses the latest rate dated on or before the reference date', () => {
    // USD has 1.34 on 2026-06-30 and 1.35 on 2026-10-31.
    expect(toSgd(100, 'USD', fx, '2026-11-05')).toBe(135);
    expect(toSgd(100, 'USD', fx, '2026-06-30')).toBe(134);
    expect(toSgd(100, 'USD', fx, '2026-09-15')).toBe(134);
  });

  it('ignores rates dated after the reference date', () => {
    // EUR has 1.46 on 2026-06-30 and 1.47 on 2026-10-31.
    expect(toSgd(1_000_000, 'EUR', fx, '2026-08-15')).toBe(1_460_000);
    expect(toSgd(1_000_000, 'EUR', fx, '2026-06-30')).toBe(1_460_000);
    expect(toSgd(1_000_000, 'EUR', fx, '2026-10-31')).toBe(1_470_000);
  });

  it('treats SGD as the base currency without a rate row', () => {
    expect(toSgd(1_234, 'SGD', fx, '2026-11-05')).toBe(1_234);
    expect(fxRate('SGD', fx, '2026-11-05')).toEqual({
      date: '2026-11-05',
      currency: 'SGD',
      sgdPerUnit: 1,
    });
  });

  it('throws on an unknown currency', () => {
    expect(() => toSgd(100, 'CHF' as Currency, fx, '2026-11-05')).toThrow(/No FX rate for CHF/);
  });

  it('throws when the currency has no rate on or before the reference date', () => {
    // VND only has a rate from 2026-10-31.
    expect(() => toSgd(100, 'VND', fx, '2026-09-30')).toThrow(/No FX rate for VND/);
    // JPY has a rate but only from 2026-06-30.
    expect(() => toSgd(100, 'JPY', fx, '2026-01-01')).toThrow(/No FX rate for JPY/);
  });

  it('rejects a malformed reference date instead of comparing strings', () => {
    expect(() => toSgd(100, 'USD', fx, '05/11/2026')).toThrow(/Invalid ISO date/);
  });
});
