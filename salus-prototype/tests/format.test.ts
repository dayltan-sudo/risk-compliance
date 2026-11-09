import { describe, expect, it } from 'vitest';

import {
  formatCount,
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatPct,
} from '../src/app/components/format';
import { AS_OF } from './helpers';

describe('formatDate', () => {
  it('renders an ISO date as an unpadded day, an abbreviated month and the year', () => {
    expect(formatDate(AS_OF)).toBe('5 Nov 2026');
  });

  it('reads the month from the fixed table at both ends of the year', () => {
    expect(formatDate('2026-01-09')).toBe('9 Jan 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('returns an empty string unchanged', () => {
    expect(formatDate('')).toBe('');
  });

  it('returns malformed input unchanged rather than inventing a date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatDate('2026-11')).toBe('2026-11');
    expect(formatDate('2026-11-xx')).toBe('2026-11-xx');
    expect(formatDate('2026-13-01')).toBe('2026-13-01');
    expect(formatDate('2026-11-05T00:00:00Z')).toBe('2026-11-05T00:00:00Z');
  });
});

describe('formatMoneyCompact', () => {
  it('renders zero and values below a thousand as whole dollars', () => {
    expect(formatMoneyCompact(0)).toBe('SGD 0');
    expect(formatMoneyCompact(999)).toBe('SGD 999');
  });

  it('switches to thousands at exactly a thousand', () => {
    expect(formatMoneyCompact(1_000)).toBe('SGD 1k');
    expect(formatMoneyCompact(1_500)).toBe('SGD 2k');
  });

  it('drops decimals as the million figure grows', () => {
    expect(formatMoneyCompact(1_000_000)).toBe('SGD 1.00m');
    expect(formatMoneyCompact(12_345_678)).toBe('SGD 12.3m');
    expect(formatMoneyCompact(250_000_000)).toBe('SGD 250m');
  });

  it('switches to billions at exactly a billion', () => {
    expect(formatMoneyCompact(1_000_000_000)).toBe('SGD 1.00b');
    expect(formatMoneyCompact(3_576_000_000)).toBe('SGD 3.58b');
  });

  it('keeps the sign on negative amounts', () => {
    expect(formatMoneyCompact(-1_234)).toBe('SGD -1k');
    expect(formatMoneyCompact(-2_500_000)).toBe('SGD -2.50m');
  });

  it('surfaces a non-finite amount instead of coercing it to a figure', () => {
    expect(formatMoneyCompact(Number.NaN)).toBe('SGD NaN');
  });
});

describe('formatMoney', () => {
  it('groups whole units without locale data', () => {
    expect(formatMoney(0, 'SGD')).toBe('SGD 0');
    expect(formatMoney(999, 'SGD')).toBe('SGD 999');
    expect(formatMoney(1_000, 'SGD')).toBe('SGD 1,000');
    expect(formatMoney(12_345_678, 'SGD')).toBe('SGD 12,345,678');
  });

  it('rounds to whole units before grouping and keeps the given currency', () => {
    expect(formatMoney(1_234.6, 'SGD')).toBe('SGD 1,235');
    expect(formatMoney(1_234, 'USD')).toBe('USD 1,234');
  });

  it('puts the sign after the currency on negative amounts', () => {
    expect(formatMoney(-1_234, 'SGD')).toBe('SGD -1,234');
    expect(formatMoney(-2_500_000.4, 'SGD')).toBe('SGD -2,500,000');
  });

  it('surfaces a non-finite amount instead of coercing it to a figure', () => {
    expect(formatMoney(Number.NaN, 'SGD')).toBe('SGD NaN');
  });
});

describe('formatPct', () => {
  it('formats with one decimal by default, without scaling the value', () => {
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct(90.03)).toBe('90.0%');
    expect(formatPct(999)).toBe('999.0%');
    expect(formatPct(1_000)).toBe('1000.0%');
    expect(formatPct(12_345_678)).toBe('12345678.0%');
  });

  it('takes an explicit decimal count', () => {
    expect(formatPct(12.3456, 2)).toBe('12.35%');
    expect(formatPct(87.6, 0)).toBe('88%');
  });

  it('keeps the sign on negative values', () => {
    expect(formatPct(-12.34)).toBe('-12.3%');
  });

  it('surfaces a non-finite value instead of a percentage', () => {
    expect(formatPct(Number.NaN)).toBe('NaN%');
  });
});

describe('formatCount', () => {
  it('renders counts as plain digits, without grouping', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_000)).toBe('1000');
    expect(formatCount(12_345_678)).toBe('12345678');
  });

  it('keeps the sign on negative counts', () => {
    expect(formatCount(-42)).toBe('-42');
  });

  it('surfaces a non-finite value instead of an empty string', () => {
    expect(formatCount(Number.NaN)).toBe('NaN');
  });
});
