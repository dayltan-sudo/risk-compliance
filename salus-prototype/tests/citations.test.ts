import { describe, expect, it } from 'vitest';

import { citationHref, parseAnswer } from '../src/app/components/citations';
import type { CitationLike } from '../src/app/components/citations';

/** Every marker prefix the assistant parser accepts, and the route each type owns. */
const CITATION_TYPES: Array<Pick<CitationLike, 'type'> & { id: string; href: string }> = [
  { type: 'requirement', id: 'REQ-06', href: '/contracts' },
  { type: 'policy', id: 'POL-02', href: '/coverage' },
  { type: 'coverage', id: 'COV-11', href: '/coverage' },
  { type: 'site', id: 'SITE-08', href: '/map' },
  { type: 'exclusion', id: 'EXC-01', href: '/exclusions' },
  { type: 'kpi', id: 'KPI-TIV', href: '/' },
  { type: 'entity', id: 'ENT-02', href: '/' },
  { type: 'carrier', id: 'CAR-03', href: '/' },
  { type: 'broker', id: 'BRK-04', href: '/' },
  { type: 'premium', id: 'PREM-05', href: '/' },
  { type: 'score', id: 'SCORE-08', href: '/' },
  { type: 'driver', id: 'DRIVER-08-CLAIMS', href: '/' },
];

describe('parseAnswer', () => {
  it('returns plain text as a single prose segment', () => {
    const text = 'No figures and no bracketed markers here.';

    expect(parseAnswer(text)).toEqual([{ kind: 'text', text }]);
  });

  it('splits out one citation marker and keeps the prose around it', () => {
    expect(parseAnswer('Group TIV is SGD 3.58b [KPI-TIV].')).toEqual([
      { kind: 'text', text: 'Group TIV is SGD 3.58b ' },
      { kind: 'citation', id: 'KPI-TIV', marker: '[KPI-TIV]', type: 'kpi' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('splits two markers with the prose between and after them', () => {
    const text =
      'Site-08 carries the largest gap [SITE-08]; the contract requires more [REQ-06].';

    expect(parseAnswer(text)).toEqual([
      { kind: 'text', text: 'Site-08 carries the largest gap ' },
      { kind: 'citation', id: 'SITE-08', marker: '[SITE-08]', type: 'site' },
      { kind: 'text', text: '; the contract requires more ' },
      { kind: 'citation', id: 'REQ-06', marker: '[REQ-06]', type: 'requirement' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('does not emit an empty prose segment between adjacent markers', () => {
    expect(parseAnswer('[REQ-06][POL-02] ends.')).toEqual([
      { kind: 'citation', id: 'REQ-06', marker: '[REQ-06]', type: 'requirement' },
      { kind: 'citation', id: 'POL-02', marker: '[POL-02]', type: 'policy' },
      { kind: 'text', text: ' ends.' },
    ]);
  });

  it('leaves an unknown prefix in the prose and still splits the next known marker', () => {
    expect(parseAnswer('a [FOO-99] b [REQ-06]')).toEqual([
      { kind: 'text', text: 'a [FOO-99] b ' },
      { kind: 'citation', id: 'REQ-06', marker: '[REQ-06]', type: 'requirement' },
    ]);
  });

  it('leaves malformed markers in the prose', () => {
    const text = '[REQ-06 [REQ] [REQ-] [] [123-ABC] [REQ 06]';

    expect(parseAnswer(text)).toEqual([{ kind: 'text', text }]);
  });

  it('returns no segments for an empty answer', () => {
    expect(parseAnswer('')).toEqual([]);
  });

  it.each(CITATION_TYPES)('recognises $id as a $type citation', ({ id, type }) => {
    expect(parseAnswer(`See [${id}].`)).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'citation', id, marker: `[${id}]`, type },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps a multi-hyphen id whole and types it from the first segment', () => {
    const text = 'Worst score [score-site-08], driven by [driver-site-08-claims].';

    expect(parseAnswer(text)).toEqual([
      { kind: 'text', text: 'Worst score ' },
      { kind: 'citation', id: 'score-site-08', marker: '[score-site-08]', type: 'score' },
      { kind: 'text', text: ', driven by ' },
      {
        kind: 'citation',
        id: 'driver-site-08-claims',
        marker: '[driver-site-08-claims]',
        type: 'driver',
      },
      { kind: 'text', text: '.' },
    ]);
  });

  it('preserves the written case of the id', () => {
    expect(parseAnswer('See [req-06].')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'citation', id: 'req-06', marker: '[req-06]', type: 'requirement' },
      { kind: 'text', text: '.' },
    ]);
  });
});

describe('citationHref', () => {
  it.each(CITATION_TYPES)('routes $type citations to $href', ({ type, href }) => {
    expect(citationHref({ type })).toBe(href);
  });

  it('falls back to the overview for an unknown or empty type', () => {
    expect(citationHref({ type: 'document' })).toBe('/');
    expect(citationHref({ type: '' })).toBe('/');
  });

  it('trims and lowercases the type before routing', () => {
    expect(citationHref({ type: ' Requirement ' })).toBe('/contracts');
    expect(citationHref({ type: 'SITE' })).toBe('/map');
  });
});
