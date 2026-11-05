import type { Currency, FxRate } from './types';
import { assertIsoDate } from './dates';

/**
 * The single most recent rate for `currency` on or before `refDate`.
 * Rates are never interpolated: a dated rate is used as-is so a figure can be
 * reproduced by pointing at the exact row.
 */
export function fxRate(currency: Currency, fx: FxRate[], refDate: string): FxRate {
  assertIsoDate(refDate, 'refDate');
  if (currency === 'SGD') {
    return { date: refDate, currency: 'SGD', sgdPerUnit: 1 };
  }

  let chosen: FxRate | undefined;
  for (const rate of fx) {
    if (rate.currency !== currency) continue;
    if (rate.date > refDate) continue;
    if (chosen === undefined || rate.date > chosen.date) chosen = rate;
  }

  if (chosen === undefined) {
    throw new Error(`No FX rate for ${currency} on or before ${refDate}`);
  }
  return chosen;
}

/**
 * Converts an amount in `currency` to SGD using the latest rate dated on or
 * before `refDate`. Throws when no such rate exists — a silent 1:1 fallback
 * would quietly corrupt every downstream ratio.
 */
export function toSgd(amount: number, currency: Currency, fx: FxRate[], refDate: string): number {
  if (!Number.isFinite(amount)) {
    throw new Error(`Cannot convert a non-finite amount: ${String(amount)}`);
  }
  const rate = fxRate(currency, fx, refDate);
  return amount * rate.sgdPerUnit;
}
