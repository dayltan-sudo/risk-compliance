/** Presentation-only formatting. Every figure it receives comes from `src/engine`. */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** `2026-11-05` -> `5 Nov 2026`. Deterministic, no locale data. */
export function formatDate(iso: string): string {
  const parts = iso.split('-');
  const year = parts[0];
  const month = MONTHS[Number(parts[1]) - 1];
  const day = Number(parts[2]);
  if (year === undefined || month === undefined || !Number.isFinite(day)) return iso;
  return `${day} ${month} ${year}`;
}

/** Compact SGD, for tiles and table cells. Exact values go in hints and tooltips. */
export function formatMoneyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `SGD ${(value / 1_000_000_000).toFixed(2)}b`;
  if (abs >= 1_000_000) {
    const millions = value / 1_000_000;
    const digits = Math.abs(millions) >= 100 ? 0 : Math.abs(millions) >= 10 ? 1 : 2;
    return `SGD ${millions.toFixed(digits)}m`;
  }
  if (abs >= 1_000) return `SGD ${Math.round(value / 1_000)}k`;
  return `SGD ${Math.round(value)}`;
}

/** Exact amount in its own currency, grouped without locale data. */
export function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${rounded < 0 ? '-' : ''}${digits}`;
}

/** One decimal by default, e.g. `90.0%`. */
export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatCount(value: number): string {
  return String(value);
}
