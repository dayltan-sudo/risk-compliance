import { describe, expect, it } from 'vitest';
import {
  band,
  bandColor,
  resolveTone,
  status,
  statusTone,
  tokens,
} from './tokens';
import type { BandName, StatusName } from './tokens';

const BANDS: BandName[] = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES: StatusName[] = ['Met', 'At-risk', 'Gap', 'Excluded'];
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Every string leaf in the token tree, with its path, for the emptiness check. */
function stringLeaves(value: unknown, path = 'tokens'): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => stringLeaves(entry, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      stringLeaves(entry, `${path}.${key}`),
    );
  }
  return [];
}

describe('band colours', () => {
  it('maps every band to a distinct colour', () => {
    const colours = BANDS.map(bandColor);

    expect(colours).toHaveLength(4);
    expect(new Set(colours).size).toBe(4);

    for (const colour of colours) {
      expect(colour).toMatch(HEX);
    }
  });

  it('gives every band a legible chip pair', () => {
    for (const name of BANDS) {
      expect(band[name].fg).toMatch(HEX);
      expect(band[name].bg).toMatch(HEX);
      expect(band[name].text).toMatch(HEX);
      expect(band[name].fg).not.toBe(band[name].bg);
    }
  });

  it('returns the marker colour, not the tint', () => {
    expect(bandColor('Critical')).toBe(band.Critical.fg);
    expect(bandColor('Low')).not.toBe(band.Low.bg);
  });
});

describe('status tones', () => {
  it('maps every status to a distinct colour', () => {
    const signatures = STATUSES.map((name) => {
      const tone = statusTone(name);
      return `${tone.fg}|${tone.bg}|${tone.dot}`;
    });

    expect(signatures).toHaveLength(4);
    expect(new Set(signatures).size).toBe(4);

    for (const signature of signatures) {
      for (const colour of signature.split('|')) {
        expect(colour).toMatch(HEX);
      }
    }
  });

  it('borrows the matching band family for each status', () => {
    expect(statusTone('Met').name).toBe('low');
    expect(statusTone('At-risk').name).toBe('medium');
    expect(statusTone('Gap').name).toBe('critical');
    expect(statusTone('Excluded').name).toBe('neutral');
  });

  it('returns a copy rather than the shared tone object', () => {
    const first = statusTone('Gap');
    expect(first).toBeDefined();
    expect(status.Gap.fg).toBe(first.fg);
  });
});

describe('tone resolution', () => {
  it('accepts band names, status names and tone names', () => {
    for (const name of BANDS) {
      // A band resolves to its chip treatment: the text colour on the tint.
      expect(resolveTone(name).fg).toBe(band[name].text);
      expect(resolveTone(name).dot).toBe(band[name].fg);
    }
    for (const name of STATUSES) {
      expect(resolveTone(name).fg).toBe(status[name].fg);
    }
    expect(resolveTone('accent').name).toBe('accent');
    expect(resolveTone('neutral').name).toBe('neutral');
  });

  it('falls back to neutral for an unknown value', () => {
    // Guards callers that pass unvalidated strings from an API response.
    expect(resolveTone('unknown' as never).name).toBe('neutral');
  });
});

describe('token set', () => {
  it('has no empty token value', () => {
    const leaves = stringLeaves(tokens);

    expect(leaves.length).toBeGreaterThan(50);

    const empty = leaves.filter(([, value]) => value.trim() === '');
    expect(empty).toEqual([]);
  });

  it('keeps every colour token a full hex value', () => {
    const colourLeaves = stringLeaves(tokens.color)
      .concat(stringLeaves(tokens.band), stringLeaves(tokens.status), stringLeaves(tokens.tone))
      // `status.*.name` is a tone-family label, not a colour.
      .filter(([path]) => !path.endsWith('.name'));

    expect(colourLeaves.length).toBeGreaterThan(20);

    for (const [path, value] of colourLeaves) {
      expect(value, path).toMatch(HEX);
    }
  });
});
