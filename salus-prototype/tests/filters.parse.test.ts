import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS, parseFilters } from '../src/app/layout/filters';
import type { FilterState } from '../src/app/layout/filters';
import { portfolio } from '../src/data/portfolio';

/**
 * `parseFilters` is the only reader of the view query string. Whatever the
 * filter bar writes into the URL has to come back as the same state, and a
 * value the bar could not have written (a stale or hand-edited link) must
 * leave that filter off rather than narrow the view to a scope the user never
 * asked for.
 *
 * `?line=` is the exception: it is how the bar encodes an explicit "no lines
 * selected", which is a real scope and not the same thing as "all lines".
 */

const parse = (query: string): FilterState => parseFilters(new URLSearchParams(query));

describe('parseFilters', () => {
  it('returns the empty state for no params at all', () => {
    expect(parseFilters(new URLSearchParams())).toEqual(EMPTY_FILTERS);
    expect(parse('')).toEqual(EMPTY_FILTERS);
  });

  it('reads every field when all five are set', () => {
    const filters = parse('line=cyber,marine-cargo&entity=ent-03&renew=60&gaps=1&risk=high');

    expect(filters).toEqual({
      lines: ['Marine Cargo', 'Cyber'],
      entityId: 'ent-03',
      renewalWindow: 60,
      gapsOnly: true,
      highRiskOnly: true,
    });
  });

  it('returns line names in the engine order, whatever order the URL lists them', () => {
    expect(parse('line=cyber,marine-cargo').lines).toEqual(['Marine Cargo', 'Cyber']);
    expect(parse('line=marine-cargo,cyber').lines).toEqual(['Marine Cargo', 'Cyber']);
  });

  it('drops a repeated line slug', () => {
    expect(parse('line=cyber,cyber').lines).toEqual(['Cyber']);
  });

  it('keeps a valid line alongside an unknown one', () => {
    expect(parse('line=cyber,telepathy').lines).toEqual(['Cyber']);
  });

  it('leaves the line filter off when no slug in the URL names a real line', () => {
    // A stale link must not read as "no lines in scope": unknown values on the
    // other four fields are ignored too, and an empty scope is a real answer
    // for the page, not a fallback.
    expect(parse('line=telepathy').lines).toBeNull();
  });

  it('keeps an empty line value as an explicit empty selection', () => {
    // The bar's "No lines" control writes this; it means no sites in scope.
    expect(parse('line=').lines).toEqual([]);
    expect(parse('line=%20').lines).toEqual([]);
  });

  it('accepts every entity id the seed defines', () => {
    for (const entity of portfolio.entities) {
      expect(parse(`entity=${entity.id}`).entityId, entity.id).toBe(entity.id);
    }
  });

  it('ignores an entity id that is not in the portfolio', () => {
    expect(parse('entity=ent-99').entityId).toBeNull();
    expect(parse('entity=').entityId).toBeNull();
  });

  it('reads each allowed renewal window as a number', () => {
    expect(parse('renew=30').renewalWindow).toBe(30);
    expect(parse('renew=60').renewalWindow).toBe(60);
    expect(parse('renew=90').renewalWindow).toBe(90);
  });

  it('ignores a renewal window outside 30 / 60 / 90', () => {
    for (const value of ['45', '0', '365', '-30', '30.0', '030', '']) {
      expect(parse(`renew=${value}`).renewalWindow, value).toBeNull();
    }
  });

  it('treats only 1 for gaps and high for risk as set', () => {
    expect(parse('gaps=1').gapsOnly).toBe(true);
    expect(parse('risk=high').highRiskOnly).toBe(true);

    expect(parse('gaps=true').gapsOnly).toBe(false);
    expect(parse('gaps=0').gapsOnly).toBe(false);
    expect(parse('risk=medium').highRiskOnly).toBe(false);
    expect(parse('risk=High').highRiskOnly).toBe(false);
  });

  it('reads the first occurrence of a repeated parameter', () => {
    expect(parse('line=cyber&line=marine-cargo').lines).toEqual(['Cyber']);
    expect(parse('entity=ent-03&entity=ent-01').entityId).toBe('ent-03');
    expect(parse('renew=30&renew=90').renewalWindow).toBe(30);
    expect(parse('gaps=0&gaps=1').gapsOnly).toBe(false);
  });

  it('ignores query parameters it does not own', () => {
    expect(parse('site=site-01&all=1&q=marine')).toEqual(EMPTY_FILTERS);
  });
});
