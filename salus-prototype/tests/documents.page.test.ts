import { describe, expect, it } from 'vitest';

import {
  FIXTURES,
  acceptedRowFromQueued,
  buildPostView,
  buildQueuedRow,
  completenessLabel,
  completenessTone,
  correctionRows,
  describeFailure,
  formatConfidence,
  formatDocumentType,
  formatFieldKey,
  postHeadline,
  reasonLabel,
  splitFields,
} from '../src/app/pages/Documents';
import type { AuditEvent, PostedDocument } from '../src/ingestion/queue';
import type { Field, QueuedField } from '../src/ingestion/validate';

const ACCEPTED_POLICY_NO: Field = {
  key: 'policy_no',
  value: 'KUA-CY-26-01194',
  confidence: 0.98,
  page: 1,
  quote: 'Policy number:        KUA-CY-26-01194',
};

const QUEUED_SUM_INSURED: QueuedField = {
  key: 'sum_insured',
  value: 'SGD 12,000,000',
  confidence: 0.64,
  page: 1,
  quote: 'Limit of liability, any one claim:      SGD 12,000,000',
  reason: 'low_confidence',
};

const QUEUED_MISSING_PREMIUM: QueuedField = {
  key: 'premium_gross',
  value: '',
  confidence: 0,
  page: 0,
  quote: '',
  reason: 'missing_mandatory',
};

function auditEvent(
  overrides: Partial<AuditEvent> & Pick<AuditEvent, 'id' | 'action' | 'version' | 'summary'>,
): AuditEvent {
  return {
    at: '2026-11-05T02:00:00.000Z',
    documentId: 'slip-cyber-2',
    ...overrides,
  };
}

function postedDocument(overrides: Partial<PostedDocument> = {}): PostedDocument {
  const enqueued = auditEvent({
    id: 'evt-000001',
    action: 'document_enqueued',
    version: 0,
    summary: 'Enqueued "slip-cyber-2.txt" as slip with 4 field(s) needing review',
  });
  const versionOneCorrection = auditEvent({
    id: 'evt-000002',
    action: 'field_accepted',
    version: 1,
    field: 'sum_insured',
    extractedValue: 'SGD 12,000,000',
    acceptedValue: 'SGD 12,500,000',
    reason: 'low_confidence',
    summary: 'Accepted sum_insured as "SGD 12,500,000"',
  });
  const versionOnePost = auditEvent({
    id: 'evt-000003',
    action: 'document_posted',
    version: 1,
    summary: 'Posted slip version 1 with 3 unconfirmed field(s)',
  });
  const versionTwoCorrection = auditEvent({
    id: 'evt-000004',
    action: 'field_accepted',
    version: 2,
    field: 'sum_insured',
    extractedValue: 'SGD 12,000,000',
    acceptedValue: 'SGD 15,500,000',
    reason: 'low_confidence',
    summary: 'Accepted sum_insured as "SGD 15,500,000"',
  });
  const versionTwoConfirmation = auditEvent({
    id: 'evt-000005',
    action: 'field_accepted',
    version: 2,
    field: 'key_exclusions',
    extractedValue: 'System failure; unencrypted devices; terrorism',
    acceptedValue: 'System failure; unencrypted devices; terrorism',
    reason: 'low_confidence',
    summary: 'Accepted key_exclusions unchanged',
  });
  const versionTwoPost = auditEvent({
    id: 'evt-000006',
    action: 'document_posted',
    version: 2,
    summary: 'Posted slip version 2 with 3 unconfirmed field(s)',
  });

  return {
    documentId: 'slip-cyber-2',
    name: 'slip-cyber-2.txt',
    documentType: 'slip',
    version: 2,
    fields: {},
    unconfirmed: ['limit_aggregate', 'key_exclusions', 'premium_gross'] as const,
    completeness: 89,
    postedAt: '2026-11-05T02:00:00.000Z',
    auditEvent: versionTwoPost,
    auditTrail: [
      enqueued,
      versionOneCorrection,
      versionOnePost,
      versionTwoCorrection,
      versionTwoConfirmation,
      versionTwoPost,
    ],
    ...overrides,
  };
}

describe('fixture picker', () => {
  it('ships five distinct fixtures with raw text available client-side', () => {
    expect(FIXTURES).toHaveLength(5);
    expect(new Set(FIXTURES.map((fixture) => fixture.id)).size).toBe(5);

    for (const fixture of FIXTURES) {
      expect(fixture.file.endsWith('.txt')).toBe(true);
      expect(fixture.text.startsWith('[[page 1]]')).toBe(true);
      expect(fixture.text.length).toBeGreaterThan(500);
      expect(fixture.description.length).toBeGreaterThan(20);
    }
  });
});

describe('formatConfidence', () => {
  it('renders a 0..1 confidence as a whole percentage', () => {
    expect(formatConfidence(0.98)).toBe('98%');
    expect(formatConfidence(0.644)).toBe('64%');
    expect(formatConfidence(0)).toBe('0%');
    expect(formatConfidence(1)).toBe('100%');
  });

  it('renders an absent capture as an em dash, never 0%', () => {
    expect(formatConfidence(null)).toBe('—');
    expect(formatConfidence(undefined)).toBe('—');
    expect(formatConfidence(Number.NaN)).toBe('—');
  });
});

describe('completeness label and tone', () => {
  it('labels the API percentage', () => {
    expect(completenessLabel(78)).toBe('78% complete');
    expect(completenessLabel(0)).toBe('0% complete');
    expect(completenessLabel(100)).toBe('100% complete');
    expect(completenessLabel(Number.NaN)).toBe('—');
  });

  it('bands tone without changing the value', () => {
    expect(completenessTone(100)).toBe('low');
    expect(completenessTone(78)).toBe('medium');
    expect(completenessTone(59)).toBe('critical');
    expect(completenessTone(Number.NaN)).toBe('neutral');
  });
});

describe('field and reason labels', () => {
  it('maps canonical keys and falls back for unknown ones', () => {
    expect(formatFieldKey('sum_insured')).toBe('Sum insured');
    expect(formatFieldKey('key_exclusions')).toBe('Key exclusions');
    expect(formatFieldKey('policy_number')).toBe('Policy number');
    expect(formatFieldKey('')).toBe('');
  });

  it('maps document types', () => {
    expect(formatDocumentType('debit_note')).toBe('Debit note');
    expect(formatDocumentType('slip')).toBe('Slip');
    expect(formatDocumentType('retro_slip')).toBe('Retro slip');
  });

  it('maps every queue reason', () => {
    expect(reasonLabel('low_confidence')).toBe('Low confidence');
    expect(reasonLabel('missing_mandatory')).toBe('Missing mandatory');
    expect(reasonLabel('missing_citation')).toBe('No citation');
    expect(reasonLabel('empty_value')).toBe('Empty value');
    expect(reasonLabel('reviewer_correction')).toBe('Reviewer correction');
    expect(reasonLabel('something_else')).toBe('Something else');
  });
});

describe('splitFields', () => {
  it('splits accepted from queued and keeps the API confidence and page', () => {
    const rows = splitFields([ACCEPTED_POLICY_NO], [QUEUED_SUM_INSURED, QUEUED_MISSING_PREMIUM]);

    expect(rows.accepted).toEqual([
      {
        key: 'policy_no',
        label: 'Policy number',
        value: 'KUA-CY-26-01194',
        confidence: 0.98,
        page: 1,
        reviewed: false,
        quote: 'Policy number:        KUA-CY-26-01194',
      },
    ]);

    expect(rows.queued).toHaveLength(2);
    expect(rows.queued[0]).toMatchObject({
      key: 'sum_insured',
      label: 'Sum insured',
      reason: 'low_confidence',
      reasonLabel: 'Low confidence',
      confidence: 0.64,
      page: 1,
    });
  });

  it('treats a mandatory key the model never returned as having no confidence and no page', () => {
    const rows = splitFields([], [QUEUED_MISSING_PREMIUM]);

    expect(rows.queued[0]).toMatchObject({
      key: 'premium_gross',
      confidence: null,
      page: null,
      reasonLabel: 'Missing mandatory',
    });
  });

  it('never lists the same key in both lists', () => {
    const rows = splitFields([ACCEPTED_POLICY_NO], [{ ...QUEUED_SUM_INSURED, key: 'policy_no' }]);

    expect(rows.accepted).toHaveLength(1);
    expect(rows.queued).toHaveLength(0);
  });
});

describe('acceptedRowFromQueued', () => {
  it('moves the reviewer value across and preserves the extraction provenance', () => {
    const queued = buildQueuedRow(QUEUED_SUM_INSURED);
    const accepted = acceptedRowFromQueued(queued, 'SGD 15,500,000');

    expect(accepted).toEqual({
      key: 'sum_insured',
      label: 'Sum insured',
      value: 'SGD 15,500,000',
      confidence: 0.64,
      page: 1,
      reviewed: true,
      quote: '',
    });
  });
});

describe('post summary', () => {
  it('counts only this version and only values the reviewer actually changed', () => {
    const posted = postedDocument();
    const rows = correctionRows(posted);

    expect(rows.map((row) => row.key)).toEqual(['sum_insured', 'key_exclusions']);
    expect(rows[0]).toMatchObject({
      label: 'Sum insured',
      before: 'SGD 12,000,000',
      after: 'SGD 15,500,000',
      reason: 'Low confidence',
      changed: true,
    });
    expect(rows[1]?.changed).toBe(false);
  });

  it('builds the closing line from the post response', () => {
    const posted = postedDocument();

    expect(postHeadline(posted)).toBe(
      'Posted as version 2 · 1 field corrected by you · 3 fields still need review',
    );

    expect(buildPostView(posted)).toMatchObject({
      corrected: 1,
      confirmed: 1,
      outstanding: 3,
    });
  });

  it('uses the singular when one field is left', () => {
    const posted = postedDocument({
      version: 1,
      unconfirmed: ['premium_gross'] as const,
      auditEvent: auditEvent({
        id: 'evt-000003',
        action: 'document_posted',
        version: 1,
        summary: 'Posted slip version 1 with 1 unconfirmed field(s)',
      }),
      auditTrail: postedDocument().auditTrail.filter((event) => event.version === 1),
    });

    expect(postHeadline(posted)).toBe(
      'Posted as version 1 · 1 field corrected by you · 1 field still needs review',
    );
  });
});

describe('describeFailure', () => {
  it('names the 503 wiring failure and keeps the server text as detail', () => {
    const message =
      'extraction client is not configured; call configureDocumentRoutes() or createDocumentRoutes({ client })';

    expect(describeFailure(503, message)).toEqual({
      title: 'extraction client not configured',
      detail: message,
    });
  });

  it('passes a 400 message through unchanged', () => {
    expect(describeFailure(400, 'value must not be empty')).toEqual({
      title: 'value must not be empty',
    });
  });

  it('passes a network failure through unchanged', () => {
    expect(describeFailure(0, 'Failed to fetch')).toEqual({ title: 'Failed to fetch' });
  });
});
