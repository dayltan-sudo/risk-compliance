import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { AuditEvent } from '../src/audit/types';
import { FilterProvider } from '../src/app/layout/filters';
import { AUDIT_WINDOWS, auditWindowNote, filterAuditEvents } from '../src/app/pages/Audit';
import { AppRoutes } from '../src/app/routes';

/**
 * Item 4: the audit log gets its own 7 / 30 / all time filter, applied to the
 * events `/api/audit` already returned. The count says what the cut left out,
 * and the portfolio filter bar — which the audit body never reads — is gone
 * from this screen.
 */

const NOW = Date.parse('2026-11-05T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function event(id: string, daysAgo: number): AuditEvent {
  return {
    id,
    at: new Date(NOW - daysAgo * DAY).toISOString(),
    actor: 'Priya Raman (R&C Manager)',
    action: 'coverage.versioned',
    objectType: 'coverage',
    objectId: `cov-${id}`,
    before: null,
    after: null,
  };
}

const events: AuditEvent[] = [
  event('aud-0004', 0),
  event('aud-0003', 6),
  event('aud-0002', 29),
  event('aud-0001', 31),
  { ...event('aud-0000', 2), at: 'not-a-date' },
];

describe('audit time windows', () => {
  it('offers 7 days, 30 days and all time', () => {
    expect(AUDIT_WINDOWS.map((entry) => entry.id)).toEqual(['7', '30', 'all']);
    expect(AUDIT_WINDOWS.map((entry) => entry.label)).toEqual([
      'Last 7 days',
      'Last 30 days',
      'All time',
    ]);
  });

  it('keeps the last 7 days, newest first', () => {
    expect(filterAuditEvents(events, '7', NOW).map((row) => row.id)).toEqual([
      'aud-0004',
      'aud-0003',
    ]);
  });

  it('keeps the last 30 days', () => {
    expect(filterAuditEvents(events, '30', NOW).map((row) => row.id)).toEqual([
      'aud-0004',
      'aud-0003',
      'aud-0002',
    ]);
  });

  it('leaves out a row whose timestamp cannot be placed in a window', () => {
    const ids = filterAuditEvents(events, '30', NOW).map((row) => row.id);
    expect(ids).not.toContain('aud-0000');
    expect(filterAuditEvents(events, 'all', NOW).map((row) => row.id)).toContain('aud-0000');
  });

  it('returns every event, including a timestamp it cannot parse, for all time', () => {
    expect(filterAuditEvents(events, 'all', NOW)).toHaveLength(events.length);
  });

  it('does not mutate or alias the caller’s array', () => {
    const copy = filterAuditEvents(events, 'all', NOW);
    expect(copy).not.toBe(events);
    expect(copy).toEqual(events);
  });
});

describe('audit window counts', () => {
  it('never claims more rows than it shows', () => {
    expect(auditWindowNote(3, 5, '7')).toBe('3 of 5 events in the last 7 days');
    expect(auditWindowNote(1, 1, '30')).toBe('1 event, all in the last 30 days');
    expect(auditWindowNote(0, 5, '7')).toBe('0 of 5 events in the last 7 days');
  });

  it('says nothing was filtered when the window is all time', () => {
    expect(auditWindowNote(5, 5, 'all')).toBe('5 events · no time filter');
  });
});

describe('the audit screen', () => {
  function render(path: string): string {
    return renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(FilterProvider, null, createElement(AppRoutes)),
      ),
    );
  }

  it('renders the time filter on the audit card', () => {
    const html = render('/audit');
    expect(html).toContain('aria-label="Audit time window"');
    for (const entry of AUDIT_WINDOWS) expect(html).toContain(entry.label);
    expect(html).toContain('aria-pressed="true"');
  });

  it('hides the portfolio filter bar, which the log never reads', () => {
    expect(render('/audit')).not.toContain('Portfolio filters');
    // Every other screen keeps it.
    expect(render('/')).toContain('Portfolio filters');
  });
});
