import { describe, expect, it } from 'vitest';
import { biAdequacy, coverageGapPct, itv, limitToPml } from '../src/engine/ratios';
import { makeCoverage, m } from './helpers';

describe('itv', () => {
  it('computes 80M / 100M = 0.8 and flags under-insurance', () => {
    const result = itv(makeCoverage({ sumInsured: m(80) }), m(100));
    expect(result.value).toBeCloseTo(0.8, 10);
    expect(result.flag).toBe('under');
    expect(result.numerator).toBe(m(80));
    expect(result.denominator).toBe(m(100));
    expect(result.formula).toBe('sumInsured (SGD) / tivSgd');
  });

  it('flags over-insurance above 1.1 and leaves the band between as ok', () => {
    expect(itv(makeCoverage({ sumInsured: m(120) }), m(100)).flag).toBe('over');
    expect(itv(makeCoverage({ sumInsured: m(100) }), m(100)).flag).toBe('ok');
    expect(itv(makeCoverage({ sumInsured: m(90) }), m(100)).flag).toBe('ok');
  });

  it('converts a non-SGD coverage when given fx and a reference date', () => {
    const coverage = makeCoverage({ sumInsured: m(100), currency: 'USD' });
    const result = itv(coverage, m(135), {
      fx: [{ date: '2026-06-30', currency: 'USD', sgdPerUnit: 1.35 }],
      refDate: '2026-11-05',
    });
    expect(result.numerator).toBeCloseTo(m(135), 6);
    expect(result.value).toBeCloseTo(1, 10);
  });

  it('refuses a non-SGD coverage without a conversion context', () => {
    const coverage = makeCoverage({ sumInsured: m(100), currency: 'USD' });
    expect(() => itv(coverage, m(100))).toThrow(/needs fx and refDate/);
  });

  it('rejects a zero TIV rather than returning Infinity', () => {
    expect(() => itv(makeCoverage(), 0)).toThrow(/positive TIV/);
  });
});

describe('limitToPml', () => {
  it('flags a limit below the PML', () => {
    const result = limitToPml(m(45), m(50));
    expect(result.value).toBeCloseTo(0.9, 10);
    expect(result.flag).toBe('below');
  });

  it('passes at or above the PML', () => {
    expect(limitToPml(m(50), m(50)).flag).toBe('ok');
    expect(limitToPml(m(60), m(50)).flag).toBe('ok');
  });
});

describe('coverageGapPct', () => {
  it('returns the uninsured share of TIV', () => {
    const result = coverageGapPct(m(100), m(80));
    expect(result.value).toBeCloseTo(0.2, 10);
    expect(result.numerator).toBe(m(20));
    expect(result.denominator).toBe(m(100));
  });

  it('floors at zero when the site is over-insured', () => {
    const result = coverageGapPct(m(100), m(130));
    expect(result.value).toBe(0);
    expect(result.numerator).toBe(0);
  });
});

describe('biAdequacy', () => {
  it('returns null when either input is missing, so the UI can say not assessed', () => {
    expect(biAdequacy(makeCoverage())).toBeNull();
    expect(biAdequacy(makeCoverage({ biSumInsured: m(10) }))).toBeNull();
    expect(biAdequacy(makeCoverage({ annualGrossProfit: m(10) }))).toBeNull();
  });

  it('computes biSumInsured / annualGrossProfit', () => {
    const result = biAdequacy(makeCoverage({ biSumInsured: m(40), annualGrossProfit: m(44) }));
    expect(result?.value).toBeCloseTo(40 / 44, 10);
    expect(result?.formula).toBe('biSumInsured / annualGrossProfit');
  });
});
