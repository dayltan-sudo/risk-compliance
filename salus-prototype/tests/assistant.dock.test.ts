import { describe, expect, it } from 'vitest';

import { citationHref, parseAnswer } from '../src/app/components/citations';

describe('parseAnswer', () => {
  it('splits prose and citation markers into ordered segments', () => {
    const text =
      'Group TIV is SGD 1.2b [KPI-TIV] across 42 sites; [SITE-08] carries the largest gap [REQ-06].';

    expect(parseAnswer(text)).toEqual([
      { kind: 'text', text: 'Group TIV is SGD 1.2b ' },
      { kind: 'citation', id: 'KPI-TIV', marker: '[KPI-TIV]', type: 'kpi' },
      { kind: 'text', text: ' across 42 sites; ' },
      { kind: 'citation', id: 'SITE-08', marker: '[SITE-08]', type: 'site' },
      { kind: 'text', text: ' carries the largest gap ' },
      { kind: 'citation', id: 'REQ-06', marker: '[REQ-06]', type: 'requirement' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('leaves an unknown marker in the prose', () => {
    const text = 'The [FOO-99] token is not a citation.';

    expect(parseAnswer(text)).toEqual([{ kind: 'text', text }]);
  });

  it('returns no-marker text unchanged as a single segment', () => {
    const text = 'No figures and no bracketed markers here.';

    expect(parseAnswer(text)).toEqual([{ kind: 'text', text }]);
  });

  it('does not emit empty prose segments between adjacent markers', () => {
    expect(parseAnswer('[REQ-06][POL-02] ends.')).toEqual([
      { kind: 'citation', id: 'REQ-06', marker: '[REQ-06]', type: 'requirement' },
      { kind: 'citation', id: 'POL-02', marker: '[POL-02]', type: 'policy' },
      { kind: 'text', text: ' ends.' },
    ]);

    expect(parseAnswer('[SITE-08]')).toEqual([
      { kind: 'citation', id: 'SITE-08', marker: '[SITE-08]', type: 'site' },
    ]);
  });

  it('infers the type from the id prefix and preserves the written case', () => {
    expect(parseAnswer('See [req-06] and [EXC-01].')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'citation', id: 'req-06', marker: '[req-06]', type: 'requirement' },
      { kind: 'text', text: ' and ' },
      { kind: 'citation', id: 'EXC-01', marker: '[EXC-01]', type: 'exclusion' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('returns no segments for an empty answer', () => {
    expect(parseAnswer('')).toEqual([]);
  });
});

describe('citationHref', () => {
  it('routes each citation type to the screen that owns its records', () => {
    expect(citationHref({ type: 'requirement' })).toBe('/contracts');
    expect(citationHref({ type: 'exclusion' })).toBe('/exclusions');
    expect(citationHref({ type: 'policy' })).toBe('/coverage');
    expect(citationHref({ type: 'coverage' })).toBe('/coverage');
    expect(citationHref({ type: 'site' })).toBe('/map');
    expect(citationHref({ type: 'kpi' })).toBe('/');
  });

  it('falls back to the overview for unknown or untyped citations', () => {
    expect(citationHref({ type: 'premium' })).toBe('/');
    expect(citationHref({ type: 'driver' })).toBe('/');
    expect(citationHref({ type: '' })).toBe('/');
  });

  it('matches the type case-insensitively', () => {
    expect(citationHref({ type: ' Requirement ' })).toBe('/contracts');
    expect(citationHref({ type: 'SITE' })).toBe('/map');
  });
});
