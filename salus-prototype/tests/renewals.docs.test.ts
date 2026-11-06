import { createElement } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppRoutes } from '../src/app/routes';
import { FilterProvider } from '../src/app/layout/filters';
import {
  DocumentationTag,
  buildRenewalRows,
  filterByWindow,
} from '../src/app/pages/Renewals';
import {
  buildDocumentationIndex,
  countDocumentation,
  documentationLabel,
  documentationState,
  documentationTone,
  withDocumentation,
} from '../src/app/pages/renewalDocs';
import { portfolio } from '../src/data/portfolio';
import app from '../server/index';

/**
 * The renewal register's second question: is the paperwork in hand? The
 * derivation is pure, so the rules are tested with plain objects; the page and
 * the CSV are then checked against the real seed and server.
 */

const AS_OF = portfolio.config.effectiveFrom;
const EMPTY = buildDocumentationIndex([], []);

describe('documentation derivation', () => {
  it('reads a posted record as received, case-insensitively', () => {
    const index = buildDocumentationIndex(
      [{ fields: { policy_no: ' prp-2026-0001 ' } }],
      [],
    );

    expect(documentationState('PRP-2026-0001', index)).toBe('received');
  });

  it('reads a posted queue item as received', () => {
    const index = buildDocumentationIndex([], [{ policyNo: 'PRP-2026-0002', status: 'posted' }]);

    expect(documentationState('PRP-2026-0002', index)).toBe('received');
  });

  it('reads an unposted queue item as in review', () => {
    const index = buildDocumentationIndex([], [{ policyNo: 'PRP-2026-0003', status: 'queued' }]);

    expect(documentationState('PRP-2026-0003', index)).toBe('in review');
  });

  it('returns nothing when the queue answered and has no item for the policy', () => {
    expect(documentationState('PRP-2026-0004', EMPTY)).toBe('nothing');
  });

  it('returns unavailable when the queue could not be read', () => {
    const index = buildDocumentationIndex([], null);

    expect(documentationState('PRP-2026-0004', index)).toBe('unavailable');
  });

  it('still reports a posted record when the queue is unreadable', () => {
    const index = buildDocumentationIndex([{ fields: { policy_no: 'PRP-2026-0005' } }], null);

    expect(documentationState('PRP-2026-0005', index)).toBe('received');
  });

  it('does not claim nothing when queue items cannot be attributed to a policy', () => {
    const index = buildDocumentationIndex([], [{ status: 'queued' }]);

    expect(documentationState('PRP-2026-0006', index)).toBe('unavailable');
  });

  it('prefers received over in review for the same policy', () => {
    const index = buildDocumentationIndex(
      [],
      [
        { policyNo: 'PRP-2026-0007', status: 'queued' },
        { policyNo: 'PRP-2026-0007', status: 'posted' },
      ],
    );

    expect(documentationState('PRP-2026-0007', index)).toBe('received');
  });

  it('does not leak one policy number into another', () => {
    const index = buildDocumentationIndex([], [{ policyNo: 'PRP-2026-0008', status: 'queued' }]);

    expect(documentationState('PRP-2026-0009', index)).toBe('nothing');
  });
});

describe('documentation states on the seed rows', () => {
  const rows = buildRenewalRows(portfolio, AS_OF);

  it('attaches a state to every row', () => {
    const documented = withDocumentation(rows, EMPTY);

    expect(documented).toHaveLength(rows.length);
    expect(documented.every((row) => row.documentation === 'nothing')).toBe(true);
  });

  it('includes only nothing rows in the No documents view', () => {
    const documented = withDocumentation(rows, EMPTY);
    const undocumented = filterByWindow(documented, 'nodocs');

    expect(undocumented).toHaveLength(rows.length);

    const first = rows[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    const withOneReceived = withDocumentation(
      rows,
      buildDocumentationIndex([{ fields: { policy_no: first.policy.policyNo } }], []),
    );
    const remaining = filterByWindow(withOneReceived, 'nodocs');

    expect(remaining).toHaveLength(rows.length - 1);
    expect(remaining.some((row) => row.policy.id === first.policy.id)).toBe(false);
  });

  it('keeps unavailable rows out of the No documents view', () => {
    const documented = withDocumentation(rows, buildDocumentationIndex([], null));

    expect(filterByWindow(documented, 'nodocs')).toHaveLength(0);
  });

  it('counts each state once per row', () => {
    const documented = withDocumentation(rows, EMPTY);
    const counts = countDocumentation(documented);

    expect(counts.nothing).toBe(rows.length);
    expect(counts.received).toBe(0);
    expect(counts['in review']).toBe(0);
    expect(counts.unavailable).toBe(0);
  });
});

describe('documentation presentation', () => {
  it('marks an expired policy with nothing received as critical and overdue', () => {
    const html = renderToStaticMarkup(
      createElement(DocumentationTag, { state: 'nothing', expired: true }),
    );

    expect(html).toContain('sal-tone--critical');
    expect(html).toContain('Nothing received · overdue');
  });

  it('marks the same state on a live policy without the overdue ring', () => {
    const html = renderToStaticMarkup(
      createElement(DocumentationTag, { state: 'nothing', expired: false }),
    );

    expect(html).toContain('sal-tone--critical');
    expect(html).not.toContain('overdue');
  });

  it('gives an expired policy with a document the received tone', () => {
    const html = renderToStaticMarkup(
      createElement(DocumentationTag, { state: 'received', expired: true }),
    );

    expect(html).toContain('sal-tone--low');
    expect(html).toContain('Received');
    expect(html).not.toContain('overdue');
  });

  it('uses the neutral, unknown tone for an unreadable queue', () => {
    expect(documentationTone('unavailable')).toBe('neutral');
    expect(documentationLabel('unavailable')).toBe('Unavailable');
  });
});

function renderRenewals(): string {
  return renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: ['/renewals'] },
      createElement(FilterProvider, null, createElement(AppRoutes)),
    ),
  );
}

describe('renewal page', () => {
  it('renders the Documentation column and says unavailable before the queue is read', () => {
    const html = renderRenewals();

    expect(html).toContain('Documentation');
    expect(html).toContain('No documents');
    expect(html).toContain('Unavailable');
    expect(html).toContain('documentation unavailable');
    expect(html).not.toContain('with nothing received');
  });
});

describe('policies CSV documentation column', () => {
  it('appends the state with the same vocabulary', async () => {
    const response = await app.request('/api/export/policies.csv');
    expect(response.status).toBe(200);

    const lines = (await response.text()).trimEnd().split('\r\n');
    expect(lines[0]?.endsWith(',documentation')).toBe(true);

    const values = lines.slice(1).map((line) => line.split(',').at(-1));
    expect(values).toHaveLength(portfolio.policies.length);
    expect(new Set(values)).toEqual(new Set(['nothing']));
  });
});
