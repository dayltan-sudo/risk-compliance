import { describe, expect, it } from 'vitest';

import {
  buildDocumentationIndex,
  documentationState,
  normalisePolicyNo,
  withDocumentation,
} from '../src/app/pages/renewalDocs';
import type { PostedRecordLike, QueueDocumentLike } from '../src/app/pages/renewalDocs';

/**
 * The derivation behind the renewal register's Documentation column, tested
 * directly rather than through the page: the policy-number key every
 * comparison uses, the index built from the two sources, the state a single
 * policy resolves to, and the attach step.
 *
 * The queue is what makes this more than a lookup. A readable, attributable
 * queue that has no item for a policy means "nothing received"; a queue that
 * could not be read, or that answered with no policy numbers at all, means
 * "unavailable", because an unread queue is not a compliance gap.
 */

const postedRecord = (policyNo: string): PostedRecordLike => ({ fields: { policy_no: policyNo } });

/** A queue that answered and holds nothing, the baseline for "nothing". */
const answeredEmpty = buildDocumentationIndex([], []);

describe('normalisePolicyNo', () => {
  it('maps a null policy number to the empty key', () => {
    expect(normalisePolicyNo(null)).toBe('');
  });

  it('maps an undefined policy number to the empty key', () => {
    expect(normalisePolicyNo(undefined)).toBe('');
  });

  it('maps an empty string to the empty key', () => {
    expect(normalisePolicyNo('')).toBe('');
  });

  it('strips stray leading and trailing whitespace', () => {
    expect(normalisePolicyNo('  PRP-2026-0001 \t')).toBe('PRP-2026-0001');
  });

  it('upper-cases mixed case so two spellings of one number share a key', () => {
    expect(normalisePolicyNo('prP-2026-0001')).toBe('PRP-2026-0001');
    expect(normalisePolicyNo(' pRp-2026-0001 ')).toBe(normalisePolicyNo('PRP-2026-0001'));
  });

  it('leaves the digits and hyphens alone', () => {
    expect(normalisePolicyNo('prp-2026-0001')).toBe('PRP-2026-0001');
  });
});

describe('buildDocumentationIndex', () => {
  it('reads an empty document list as a queue that answered and is empty', () => {
    const index = buildDocumentationIndex([], []);

    expect(index.postedPolicyNos.size).toBe(0);
    expect(index.queueByPolicy.size).toBe(0);
    expect(index.queueReadable).toBe(true);
    expect(index.queueAttributable).toBe(true);
  });

  it('indexes a posted record that has no queue document', () => {
    const index = buildDocumentationIndex([postedRecord(' prp-2026-0001 ')], []);

    expect([...index.postedPolicyNos]).toEqual(['PRP-2026-0001']);
    expect(index.queueByPolicy.has('PRP-2026-0001')).toBe(false);
    expect(index.queueReadable).toBe(true);
    expect(index.queueAttributable).toBe(true);
  });

  it('indexes a queue document that has no posted record', () => {
    const index = buildDocumentationIndex([], [{ policyNo: 'prp-2026-0002', status: 'queued' }]);

    expect(index.postedPolicyNos.size).toBe(0);
    expect(index.queueByPolicy.get('PRP-2026-0002')).toHaveLength(1);
  });

  it('groups every queue item for one policy under a single key', () => {
    const index = buildDocumentationIndex(
      [],
      [
        { policyNo: 'PRP-2026-0003', status: 'queued' },
        { policyNo: ' prp-2026-0003', status: 'posted' },
      ],
    );

    expect(index.queueByPolicy.get('PRP-2026-0003')).toHaveLength(2);
  });

  it('leaves a policy that appears in neither source out of the index', () => {
    const index = buildDocumentationIndex([postedRecord('PRP-2026-0004')], [
      { policyNo: 'PRP-2026-0005', status: 'queued' },
    ]);

    expect(index.postedPolicyNos.has('PRP-2026-0099')).toBe(false);
    expect(index.queueByPolicy.has('PRP-2026-0099')).toBe(false);
  });

  it('records an unread queue as neither readable nor attributable', () => {
    const index = buildDocumentationIndex([postedRecord('PRP-2026-0006')], null);

    expect(index.postedPolicyNos.has('PRP-2026-0006')).toBe(true);
    expect(index.queueReadable).toBe(false);
    expect(index.queueAttributable).toBe(false);
  });

  it('treats a queue whose items carry no policy number as unattributable', () => {
    const index = buildDocumentationIndex([], [{ status: 'queued' } satisfies QueueDocumentLike]);

    expect(index.queueReadable).toBe(true);
    expect(index.queueAttributable).toBe(false);
    expect(index.queueByPolicy.size).toBe(0);
  });
});

describe('documentationState', () => {
  it('reports received for a posted record with no queue document', () => {
    const index = buildDocumentationIndex([postedRecord('PRP-2026-0001')], []);

    expect(documentationState('PRP-2026-0001', index)).toBe('received');
  });

  it('reports in review for a queued document with no posted record', () => {
    const index = buildDocumentationIndex([], [{ policyNo: 'PRP-2026-0002', status: 'queued' }]);

    expect(documentationState('PRP-2026-0002', index)).toBe('in review');
  });

  it('reports received for a queue document that has been posted', () => {
    const index = buildDocumentationIndex([], [{ policyNo: 'PRP-2026-0003', status: 'posted' }]);

    expect(documentationState('PRP-2026-0003', index)).toBe('received');
  });

  it('reports nothing for a policy in neither source when the queue answered', () => {
    expect(documentationState('PRP-2026-0004', answeredEmpty)).toBe('nothing');
  });

  it('reports unavailable, not nothing, for the same policy when the queue could not be read', () => {
    const index = buildDocumentationIndex([], null);

    expect(documentationState('PRP-2026-0004', index)).toBe('unavailable');
  });

  it('still reports a posted record as received when the queue could not be read', () => {
    const index = buildDocumentationIndex([postedRecord('PRP-2026-0005')], null);

    expect(documentationState('PRP-2026-0005', index)).toBe('received');
  });

  it('matches the policy number case- and whitespace-insensitively', () => {
    const index = buildDocumentationIndex([postedRecord('prp-2026-0006')], []);

    expect(documentationState('  PrP-2026-0006 ', index)).toBe('received');
  });

  it('does not lend one policy the documents of another', () => {
    const index = buildDocumentationIndex([postedRecord('PRP-2026-0007')], [
      { policyNo: 'PRP-2026-0008', status: 'queued' },
    ]);

    expect(documentationState('PRP-2026-0008', index)).toBe('in review');
    expect(documentationState('PRP-2026-0007', index)).toBe('received');
    expect(documentationState('PRP-2026-0009', index)).toBe('nothing');
  });
});

describe('withDocumentation', () => {
  it('attaches one state per row, read from its own policy number', () => {
    const rows = [
      { policy: { policyNo: 'prp-2026-0001' }, premiumSgd: 1_000 },
      { policy: { policyNo: 'PRP-2026-0002' }, premiumSgd: 2_000 },
      { policy: { policyNo: 'PRP-2026-0003' }, premiumSgd: 3_000 },
    ];
    const index = buildDocumentationIndex([postedRecord('PRP-2026-0001')], [
      { policyNo: 'PRP-2026-0002', status: 'queued' },
    ]);

    expect(withDocumentation(rows, index)).toEqual([
      { policy: { policyNo: 'prp-2026-0001' }, premiumSgd: 1_000, documentation: 'received' },
      { policy: { policyNo: 'PRP-2026-0002' }, premiumSgd: 2_000, documentation: 'in review' },
      { policy: { policyNo: 'PRP-2026-0003' }, premiumSgd: 3_000, documentation: 'nothing' },
    ]);
  });

  it('returns copies and leaves the source rows untouched', () => {
    const rows = [{ policy: { policyNo: 'PRP-2026-0004' } }];

    const documented = withDocumentation(rows, answeredEmpty);

    expect(rows).toEqual([{ policy: { policyNo: 'PRP-2026-0004' } }]);
    expect(documented[0]).not.toBe(rows[0]);
    expect(documented[0]?.documentation).toBe('nothing');
  });

  it('keeps an empty row list empty', () => {
    expect(withDocumentation([], answeredEmpty)).toEqual([]);
  });
});
