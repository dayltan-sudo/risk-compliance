/**
 * Date helpers. ISO `YYYY-MM-DD` strings only; all arithmetic is UTC so the
 * result never depends on the host timezone and there is no clock access here.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value;
}

export function assertIsoDate(value: string, label = 'date'): string {
  if (!isIsoDate(value)) {
    throw new Error(`Invalid ISO date for ${label}: ${JSON.stringify(value)} (expected YYYY-MM-DD)`);
  }
  return value;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds whole days to an ISO date. Pure and timezone-independent. */
export function addDays(isoDate: string, days: number): string {
  assertIsoDate(isoDate, 'addDays input');
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toIsoDate(parsed);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  assertIsoDate(from, 'daysBetween.from');
  assertIsoDate(to, 'daysBetween.to');
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/** True when `date` falls in the inclusive window [from, to]. */
export function isWithin(date: string, from: string, to: string | null): boolean {
  if (date < from) return false;
  if (to !== null && date > to) return false;
  return true;
}
