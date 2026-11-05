import { describe, expect, it } from 'vitest';

import { portfolio } from '../src/data/portfolio';
import { applyPostedRecords, parseAmount } from '../src/data/overlay';
import { groupSummary } from '../src/engine/summary';

/**
 * The overlay is what makes the demo's central claim true: a posted document
 * changes the portfolio the screens read. These tests pin both the parsing and
 * the effect on a real engine number.
 */

const AS_OF = portfolio.config.effectiveFrom;

describe('parseAmount', () => {
  it('reads a currency-prefixed grouped amount', () => {
    expect(parseAmount('SGD 15,000,000')).toEqual({ amount: 15_000_000, currency: 'SGD' });
  });

  it('reads a bare magnitude suffix', () => {
    expect(parseAmount('25m')).toEqual({ amount: 25_000_000, currency: null });
  });

  it('reads a spelled-out magnitude', () => {
    expect(parseAmount('USD 1.5 million')).toEqual({ amount: 1_500_000, currency: 'USD' });
  });

  it('reads the S$ form a Singapore slip uses', () => {
    expect(parseAmount('S$25,000,000')).toEqual({ amount: 25_000_000, currency: 'SGD' });
  });

  it('returns null rather than guessing', () => {
    expect(parseAmount('to be advised')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('SGD 12 per cent')).toBeNull();
  });
});

describe('applyPostedRecords', () => {
  // Hai Phong Yard is the seed's under-insured site: TIV 140m covered by 25m.
  // Posting a slip that raises it must move the group adequacy figure, or the
  // demo's "document changes the number" claim is not true.
  const policy = portfolio.policies.find((candidate) => candidate.policyNo === 'PRP-2026-0008');
  if (policy === undefined) throw new Error('seed changed: PRP-2026-0008 not found');

  it('raises the live coverage and moves the group adequacy figure', () => {
    const before = groupSummary(portfolio, AS_OF);

    const result = applyPostedRecords(portfolio, [
      {
        documentId: 'post-1',
        version: 1,
        fields: { policy_no: 'PRP-2026-0008', sum_insured: 'SGD 80,000,000' },
      },
    ]);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      policyNumber: 'PRP-2026-0008',
      field: 'sumInsured',
      before: 25_000_000,
      after: 80_000_000,
    });

    const coverage = result.portfolio.coverages.find(
      (candidate) => candidate.policyId === policy.id && candidate.validTo === null,
    );
    expect(coverage?.sumInsured).toBe(80_000_000);
    // The occurrence limit follows the sum insured, so the limit-to-PML ratio
    // does not silently change meaning.
    expect(coverage?.limitOcc).toBe(80_000_000);

    const after = groupSummary(result.portfolio, AS_OF);
    expect(after.insuredSgd).toBeGreaterThan(before.insuredSgd);
    expect(after.adequacyPct).toBeGreaterThan(before.adequacyPct);
  });

  it('does not mutate the seed portfolio', () => {
    const original = portfolio.coverages.find(
      (candidate) => candidate.policyId === policy.id && candidate.validTo === null,
    )?.sumInsured;

    applyPostedRecords(portfolio, [
      { documentId: 'post-2', version: 1, fields: { policy_no: 'PRP-2026-0008', sum_insured: 'SGD 99,000,000' } },
    ]);

    expect(
      portfolio.coverages.find((candidate) => candidate.policyId === policy.id && candidate.validTo === null)
        ?.sumInsured,
    ).toBe(original);
  });

  it('skips an unknown policy number', () => {
    const result = applyPostedRecords(portfolio, [
      { documentId: 'post-3', version: 1, fields: { policy_no: 'NOT-A-POLICY', sum_insured: 'SGD 1' } },
    ]);

    expect(result.changes).toHaveLength(0);
    expect(result.skipped[0]?.reason).toBe('unknown_policy');
  });

  it('skips a currency that does not match the coverage', () => {
    const result = applyPostedRecords(portfolio, [
      { documentId: 'post-4', version: 1, fields: { policy_no: 'PRP-2026-0008', sum_insured: 'USD 80,000,000' } },
    ]);

    expect(result.changes).toHaveLength(0);
    expect(result.skipped[0]?.reason).toBe('currency_mismatch');
  });

  it('reports a record that carries no amount', () => {
    const result = applyPostedRecords(portfolio, [
      { documentId: 'post-5', version: 1, fields: { policy_no: 'PRP-2026-0008', carrier: 'Someone' } },
    ]);

    expect(result.changes).toHaveLength(0);
    expect(result.skipped[0]?.reason).toBe('no_mappable_field');
  });

  it('is idempotent when the posted value already matches', () => {
    const unchanged = applyPostedRecords(portfolio, [
      { documentId: 'post-6', version: 1, fields: { policy_no: 'PRP-2026-0008', sum_insured: 'SGD 25,000,000' } },
    ]);

    expect(unchanged.changes).toHaveLength(0);
  });
});
