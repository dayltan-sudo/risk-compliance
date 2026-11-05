import type { Coverage, Portfolio } from '../engine/types';

/**
 * Turns posted ingestion records into a change in the portfolio the screens read.
 *
 * Without this the demo chain stops at "posted": the document is versioned and
 * audited, but every KPI is still computed from the seed, so posting a slip that
 * raises a limit moves nothing. Applying the posted fields onto the matching
 * policy's live coverage closes the chain — the ratio, the requirement status and
 * the adequacy figure all recompute from the same engine.
 *
 * It is deliberately conservative:
 * - a record only applies if its `policy_no` matches a policy in the portfolio;
 * - money is only applied when the parsed currency matches the coverage's, so a
 *   USD slip never silently overwrites an SGD limit at the wrong scale;
 * - a field that does not map to a coverage column is ignored, not guessed at.
 */

export interface PostedRecord {
  documentId: string;
  version: number;
  /** The posted field set, canonical keys to display strings ("SGD 15,000,000"). */
  fields: Readonly<Record<string, string | undefined>>;
  postedAt?: string;
}

export interface OverlayChange {
  documentId: string;
  version: number;
  policyId: string;
  policyNumber: string;
  coverageId: string;
  field: 'sumInsured' | 'limitOcc' | 'limitAgg' | 'deductible' | 'biSumInsured';
  before: number;
  after: number;
}

export interface OverlaySkip {
  documentId: string;
  reason: 'unknown_policy' | 'no_mappable_field' | 'currency_mismatch' | 'unparseable_amount';
  detail: string;
}

export interface OverlayResult {
  portfolio: Portfolio;
  changes: OverlayChange[];
  skipped: OverlaySkip[];
}

const COVERAGE_FIELDS: ReadonlyArray<{
  key: string;
  column: OverlayChange['field'];
}> = [
  { key: 'sum_insured', column: 'sumInsured' },
  { key: 'limit_occurrence', column: 'limitOcc' },
  { key: 'limit_aggregate', column: 'limitAgg' },
  { key: 'deductible', column: 'deductible' },
  { key: 'bi_sum_insured', column: 'biSumInsured' },
];

const MAGNITUDE: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  mm: 1_000_000,
  million: 1_000_000,
  bn: 1_000_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
};

const CURRENCY_CODES = ['SGD', 'USD', 'EUR', 'GBP', 'AUD', 'CNY', 'JPY', 'VND'];

export interface ParsedAmount {
  amount: number;
  currency: string | null;
}

/**
 * Reads the ways a broker slip writes money: "SGD 15,000,000", "15m",
 * "USD 1.5 million", "S$25,000,000". Returns null rather than a guess.
 */
export function parseAmount(raw: string): ParsedAmount | null {
  const text = raw.trim();
  if (text === '') return null;

  const upper = text.toUpperCase();
  const currency =
    CURRENCY_CODES.find((code) => new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`).test(upper)) ??
    (/(^|\s)S\$/.test(upper) ? 'SGD' : null);

  // Strip the currency, keep the magnitude word: "USD 1.5 MILLION" must become
  // "1.5 MILLION", not "1.5", or the scale silently drops by six figures.
  const numeric = upper
    .replace(/\b(SGD|USD|EUR|GBP|AUD|CNY|JPY|VND)\b/g, ' ')
    .replace(/S\$|\$/g, ' ')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = /^(-?\d+(?:\.\d+)?)\s*([A-Z]+)?$/.exec(numeric);
  if (match === null) return null;

  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;

  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === undefined ? 1 : MAGNITUDE[suffix];
  if (multiplier === undefined) return null;

  return { amount: base * multiplier, currency };
}

function withCoverage(portfolio: Portfolio, coverageId: string, patch: Partial<Coverage>): Portfolio {
  return {
    ...portfolio,
    coverages: portfolio.coverages.map((coverage) =>
      coverage.id === coverageId ? { ...coverage, ...patch } : coverage,
    ),
  };
}

export function applyPostedRecords(
  portfolio: Portfolio,
  records: readonly PostedRecord[],
): OverlayResult {
  let current = portfolio;
  const changes: OverlayChange[] = [];
  const skipped: OverlaySkip[] = [];

  for (const record of records) {
    const policyNumber = record.fields.policy_no?.trim();
    if (policyNumber === undefined || policyNumber === '') {
      skipped.push({
        documentId: record.documentId,
        reason: 'no_mappable_field',
        detail: 'record has no policy_no, so it cannot be matched to a policy',
      });
      continue;
    }

    const policy = current.policies.find(
      (candidate) => candidate.policyNo.toLowerCase() === policyNumber.toLowerCase(),
    );
    if (policy === undefined) {
      skipped.push({
        documentId: record.documentId,
        reason: 'unknown_policy',
        detail: `no policy numbered ${policyNumber} in scope`,
      });
      continue;
    }

    // The live version of the policy: the coverage with no validTo.
    const live = current.coverages.filter(
      (coverage) => coverage.policyId === policy.id && coverage.validTo === null,
    );
    if (live.length === 0) {
      skipped.push({
        documentId: record.documentId,
        reason: 'unknown_policy',
        detail: `policy ${policyNumber} has no live coverage version`,
      });
      continue;
    }

    let appliedAny = false;

    for (const { key, column } of COVERAGE_FIELDS) {
      const raw = record.fields[key];
      if (raw === undefined || raw.trim() === '') continue;

      const parsed = parseAmount(raw);
      const target = live.find((coverage) => (column === 'biSumInsured' ? coverage.biSumInsured !== undefined : true)) ?? live[0];
      if (target === undefined) continue;

      if (parsed === null) {
        skipped.push({
          documentId: record.documentId,
          reason: 'unparseable_amount',
          detail: `${key} = "${raw}" is not a readable amount`,
        });
        continue;
      }

      if (parsed.currency !== null && parsed.currency !== target.currency) {
        skipped.push({
          documentId: record.documentId,
          reason: 'currency_mismatch',
          detail: `${key} is ${parsed.currency} but coverage ${target.id} is ${target.currency}`,
        });
        continue;
      }

      const before = target[column] ?? 0;
      if (before === parsed.amount) continue;

      const patch: Partial<Coverage> = { [column]: parsed.amount } as Partial<Coverage>;

      // A slip's "sum insured" is the occurrence limit as well: the seed keeps
      // them equal, so applying one without the other would leave the coverage
      // internally inconsistent and quietly change the limit-to-PML ratio.
      if (column === 'sumInsured' && target.limitOcc === before) {
        (patch as Record<string, number>).limitOcc = parsed.amount;
      }

      current = withCoverage(current, target.id, patch);
      changes.push({
        documentId: record.documentId,
        version: record.version,
        policyId: policy.id,
        policyNumber: policy.policyNo,
        coverageId: target.id,
        field: column,
        before,
        after: parsed.amount,
      });
      appliedAny = true;
    }

    if (!appliedAny) {
      const alreadySkipped = skipped.some((entry) => entry.documentId === record.documentId);
      if (!alreadySkipped) {
        skipped.push({
          documentId: record.documentId,
          reason: 'no_mappable_field',
          detail: 'record matched a policy but carried no coverage amount to apply',
        });
      }
    }
  }

  return { portfolio: current, changes, skipped };
}
