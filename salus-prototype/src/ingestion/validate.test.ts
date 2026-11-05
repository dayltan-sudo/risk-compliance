import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_FIELD_KEYS,
  MANDATORY_FIELD_KEYS,
  mandatoryKeysFor,
  rawExtractionSchema,
  type CanonicalFieldKey,
  type DocumentType,
  type RawExtraction,
} from './schema';
import {
  completeness,
  DEFAULT_CONFIDENCE_THRESHOLD,
  normalise,
  toDraftPolicy,
} from './validate';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const DOCUMENTS_DIR = join(REPO_ROOT, 'fixtures', 'documents');
const EXPECTED_DIR = join(REPO_ROOT, 'fixtures', 'expected');

const FIXTURE_NAMES = [
  'slip-property-1',
  'slip-cyber-2',
  'schedule-marine-3',
  'endorsement-property-1',
  'wording-cyber-2',
] as const;

type FixtureName = (typeof FIXTURE_NAMES)[number];

interface Fixture {
  name: FixtureName;
  text: string;
  raw: RawExtraction;
}

function readFixtureFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`missing fixture file: ${path}`);
  }
}

const FIXTURES: readonly Fixture[] = FIXTURE_NAMES.map((name) => ({
  name,
  text: readFixtureFile(join(DOCUMENTS_DIR, `${name}.txt`)),
  raw: rawExtractionSchema.parse(JSON.parse(readFixtureFile(join(EXPECTED_DIR, `${name}.json`)))),
}));

function fixture(name: FixtureName): Fixture {
  const found = FIXTURES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`fixture not loaded: ${name}`);
  return found;
}

const CANONICAL_INDEX: ReadonlyMap<CanonicalFieldKey, number> = new Map(
  CANONICAL_FIELD_KEYS.map((key, index) => [key, index] as const),
);

function inCanonicalOrder(keys: readonly CanonicalFieldKey[]): CanonicalFieldKey[] {
  return [...keys].sort((a, b) => (CANONICAL_INDEX.get(a) ?? 0) - (CANONICAL_INDEX.get(b) ?? 0));
}

function keysOf(fields: readonly { key: CanonicalFieldKey }[]): CanonicalFieldKey[] {
  return inCanonicalOrder(fields.map((field) => field.key));
}

function assertQuoteOnPage(text: string, quote: string, page: number): void {
  const pageStart = text.indexOf(`[[page ${page}]]`);
  expect(pageStart, `missing page marker [[page ${page}]]`).toBeGreaterThanOrEqual(0);

  const quoteAt = text.indexOf(quote, pageStart);
  expect(quoteAt, `quote not found on page ${page}: ${quote.slice(0, 60)}`).toBeGreaterThanOrEqual(0);

  const nextPageStart = text.indexOf(`[[page ${page + 1}]]`);
  if (nextPageStart !== -1) expect(quoteAt).toBeLessThan(nextPageStart);
}

/**
 * The split these fixtures are supposed to produce, written out by hand rather
 * than derived from `normalise`, so the test would catch a change in routing
 * logic instead of agreeing with it.
 */
interface Expectation {
  documentType: DocumentType;
  accepted: CanonicalFieldKey[];
  queued: CanonicalFieldKey[];
  completeness: number;
}

const EXPECTED: Record<FixtureName, Expectation> = {
  'slip-property-1': {
    documentType: 'slip',
    accepted: [
      'policy_no',
      'insured_entity',
      'carrier',
      'line_of_business',
      'inception',
      'expiry',
      'sum_insured',
      'limit_occurrence',
      'limit_aggregate',
      'deductible',
      'premium_gross',
      'premium_tax',
      'currency',
      'site_name',
      'country',
      'tiv',
      'pml',
      'bi_sum_insured',
      'key_exclusions',
    ],
    queued: [],
    completeness: 100,
  },
  'slip-cyber-2': {
    documentType: 'slip',
    accepted: [
      'policy_no',
      'insured_entity',
      'carrier',
      'line_of_business',
      'inception',
      'expiry',
      'limit_occurrence',
      'deductible',
      'currency',
      'country',
    ],
    queued: ['sum_insured', 'limit_aggregate', 'premium_gross', 'key_exclusions'],
    // premium_gross was never captured; the other two mandatory keys are present.
    completeness: 78,
  },
  'schedule-marine-3': {
    documentType: 'schedule',
    accepted: [
      'policy_no',
      'insured_entity',
      'carrier',
      'line_of_business',
      'inception',
      'expiry',
      'sum_insured',
      'limit_occurrence',
      'deductible',
      'premium_gross',
      'premium_tax',
      'currency',
      'country',
      'key_exclusions',
    ],
    queued: [],
    completeness: 100,
  },
  'endorsement-property-1': {
    documentType: 'endorsement',
    accepted: [
      'policy_no',
      'endorsement_no',
      'insured_entity',
      'carrier',
      'line_of_business',
      'inception',
      'expiry',
      'sum_insured',
      'deductible',
      'premium_gross',
      'premium_tax',
      'currency',
      'site_name',
      'country',
    ],
    queued: [],
    completeness: 100,
  },
  'wording-cyber-2': {
    documentType: 'wording',
    accepted: ['carrier', 'line_of_business', 'key_exclusions'],
    queued: ['limit_aggregate', 'deductible'],
    completeness: 100,
  },
};

describe('fixtures', () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: every quote is exact and sits on the page it cites`, () => {
      const { raw, text } = fixture(name);
      expect(raw.fields.length).toBeGreaterThan(0);

      for (const field of raw.fields) {
        expect(field.confidence).toBeGreaterThanOrEqual(0);
        expect(field.confidence).toBeLessThanOrEqual(1);
        assertQuoteOnPage(text, field.quote, field.page);
      }
    });

    it(`${name}: expected JSON declares the agreed document type`, () => {
      expect(fixture(name).raw.documentType).toBe(EXPECTED[name].documentType);
    });
  }

  it('covers the five transcript types the ingestion phase needs', () => {
    expect(FIXTURES.map((item) => item.raw.documentType).sort()).toEqual([
      'endorsement',
      'schedule',
      'slip',
      'slip',
      'wording',
    ]);
  });

  it('has three below-threshold captures and one missing mandatory key', () => {
    const below = fixture('slip-cyber-2').raw.fields.filter(
      (field) => field.confidence < DEFAULT_CONFIDENCE_THRESHOLD,
    );
    expect(below.map((field) => field.key)).toEqual(['sum_insured', 'limit_aggregate', 'key_exclusions']);

    const keys = new Set(fixture('slip-cyber-2').raw.fields.map((field) => field.key));
    expect(keys.has('premium_gross')).toBe(false);
    expect(mandatoryKeysFor('slip')).toContain('premium_gross');
  });
});

for (const name of FIXTURE_NAMES) {
  describe(`routing ${name}`, () => {
    const { raw } = fixture(name);
    const result = normalise(raw);
    const draft = toDraftPolicy(result, `doc-${name}`);
    const expected = EXPECTED[name];

    it('accepts exactly the confident, cited captures', () => {
      expect(keysOf(result.accepted)).toEqual(expected.accepted);

      for (const field of result.accepted) {
        expect(field.confidence).toBeGreaterThanOrEqual(DEFAULT_CONFIDENCE_THRESHOLD);
        expect(field.page).toBeGreaterThanOrEqual(1);
        expect(field.quote.length).toBeGreaterThan(0);
        expect(field.value.length).toBeGreaterThan(0);
      }
    });

    it('queues exactly everything else', () => {
      expect(keysOf(result.queued)).toEqual(expected.queued);
    });

    it('never accepts and queues the same key', () => {
      const accepted = new Set(result.accepted.map((field) => field.key));
      expect(result.queued.filter((field) => accepted.has(field.key))).toEqual([]);
    });

    it('rejects nothing from a well-formed extraction', () => {
      expect(result.rejected).toEqual([]);
    });

    it('puts no queued value into the draft', () => {
      for (const field of result.accepted) {
        expect(draft[field.key]).toBe(field.value);
      }
      for (const field of result.queued) {
        expect(draft[field.key]).toBeUndefined();
        expect(draft.unconfirmed).toContain(field.key);
      }
      expect(new Set(draft.unconfirmed).size).toBe(draft.unconfirmed.length);
    });

    it('carries the document identity onto the draft', () => {
      expect(draft.documentId).toBe(`doc-${name}`);
      expect(draft.documentType).toBe(raw.documentType);
    });

    it('reports completeness of the mandatory set', () => {
      const mandatory = mandatoryKeysFor(raw.documentType);
      const present = mandatory.filter((key) => draft[key] !== undefined).length;
      const derived = Math.round((present / mandatory.length) * 100);

      expect(derived).toBe(expected.completeness);
      expect(completeness(draft)).toBe(expected.completeness);
    });
  });
}

describe('confidence routing', () => {
  it('never lets a below-threshold value reach the draft', () => {
    const { raw } = fixture('slip-cyber-2');
    const result = normalise(raw);
    const draft = toDraftPolicy(result, 'doc-cyber');

    const queued = result.queued.find((field) => field.key === 'sum_insured');
    expect(queued?.value).toBe('SGD 12,000,000');
    expect(queued?.confidence).toBeLessThan(DEFAULT_CONFIDENCE_THRESHOLD);
    expect(queued?.reason).toBe('low_confidence');

    expect(draft.sum_insured).toBeUndefined();
    expect(draft.limit_aggregate).toBeUndefined();
    expect(draft.unconfirmed).toContain('sum_insured');
    expect(draft.unconfirmed).toContain('limit_aggregate');
  });

  it('does not copy a queued value into any other draft slot', () => {
    const raw: RawExtraction = {
      documentType: 'slip',
      fields: [
        { key: 'sum_insured', value: 'SGD 99,999,999', confidence: 0.61, page: 1, quote: 'Sum insured: SGD 99,999,999' },
      ],
    };

    const draft = toDraftPolicy(normalise(raw), 'doc-low-confidence');
    expect(draft.sum_insured).toBeUndefined();
    expect(Object.values(draft)).not.toContain('SGD 99,999,999');
    expect(draft.unconfirmed).toContain('sum_insured');
  });

  it('accepts at the threshold and queues just below it', () => {
    const { raw } = fixture('slip-property-1');
    const pml = raw.fields.find((field) => field.key === 'pml');
    expect(pml?.confidence).toBe(DEFAULT_CONFIDENCE_THRESHOLD);

    const atDefault = normalise(raw);
    expect(atDefault.accepted.map((field) => field.key)).toContain('pml');
    expect(atDefault.queued.map((field) => field.key)).not.toContain('pml');

    const strict = normalise(raw, { threshold: 0.81 });
    expect(strict.queued.map((field) => field.key)).toContain('pml');
    expect(strict.accepted.map((field) => field.key)).not.toContain('pml');
  });

  it('applies a custom threshold through to the draft', () => {
    const draft = toDraftPolicy(
      normalise(fixture('slip-property-1').raw, { threshold: 0.98 }),
      'doc-strict',
    );

    expect(draft.policy_no).toBe('NGS-PL-SG-26-00873'); // 0.99
    expect(draft.currency).toBe('SGD'); // 0.98
    expect(draft.insured_entity).toBeUndefined(); // 0.97
    expect(draft.unconfirmed).toContain('insured_entity');
    expect(completeness(draft)).toBe(22); // 2 of 9 mandatory keys
  });

  it('rejects a threshold outside 0..1 rather than guessing', () => {
    const empty: RawExtraction = { documentType: 'slip', fields: [] };
    expect(() => normalise(empty, { threshold: 1.5 })).toThrow(RangeError);
    expect(() => normalise(empty, { threshold: -0.1 })).toThrow(RangeError);
    expect(() => normalise(empty, { threshold: Number.NaN })).toThrow(RangeError);
  });
});

describe('missing mandatory keys', () => {
  it('queues an uncaptured mandatory key as an empty, zero-confidence placeholder', () => {
    const result = normalise(fixture('slip-cyber-2').raw);
    const placeholder = result.queued.find((field) => field.key === 'premium_gross');

    expect(placeholder).toEqual({
      key: 'premium_gross',
      value: '',
      confidence: 0,
      page: 0,
      quote: '',
      reason: 'missing_mandatory',
    });

    const draft = toDraftPolicy(result, 'doc-cyber');
    expect(draft.premium_gross).toBeUndefined();
    expect(draft.unconfirmed).toContain('premium_gross');
  });

  it('lists every uncaptured mandatory key on an empty slip and scores it 0%', () => {
    const draft = toDraftPolicy(normalise({ documentType: 'slip', fields: [] }), 'doc-empty');

    expect(draft.unconfirmed).toEqual(inCanonicalOrder(MANDATORY_FIELD_KEYS));
    expect(completeness(draft)).toBe(0);
  });

  it('applies the wording mandatory set, not the policy-record set', () => {
    const draft = toDraftPolicy(normalise({ documentType: 'wording', fields: [] }), 'doc-wording');

    expect(draft.unconfirmed).toEqual(inCanonicalOrder(mandatoryKeysFor('wording')));
    expect(draft.unconfirmed).not.toContain('policy_no');
    expect(draft.unconfirmed).not.toContain('premium_gross');
    expect(completeness(draft)).toBe(0);
  });
});

describe('admission rules', () => {
  it('rejects an unknown key instead of passing it through', () => {
    const raw: RawExtraction = {
      documentType: 'slip',
      fields: [
        { key: 'policy_no', value: 'NGS-PL-SG-26-00873', confidence: 0.95, page: 1, quote: 'Policy number: NGS-PL-SG-26-00873' },
        { key: 'policy_number', value: 'NGS-PL-SG-26-00873', confidence: 0.99, page: 1, quote: 'Policy number: NGS-PL-SG-26-00873' },
      ],
    };

    const result = normalise(raw);

    expect(result.accepted.map((field) => field.key)).toEqual(['policy_no']);
    expect(result.queued.map((field) => field.key)).not.toContain('policy_number');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ key: 'policy_number', code: 'unknown_key' });
    expect(result.rejected[0]?.reason).toMatch(/not in the canonical policy field set/i);

    const draft = toDraftPolicy(result, 'doc-unknown');
    expect(Object.keys(draft)).not.toContain('policy_number');
    expect((draft as unknown as Record<string, unknown>)['policy_number']).toBeUndefined();
  });

  it('does not let an unknown key satisfy a mandatory requirement', () => {
    const raw: RawExtraction = {
      documentType: 'slip',
      fields: [
        { key: 'policy_number', value: 'NGS-PL-SG-26-00873', confidence: 0.99, page: 1, quote: 'Policy number: NGS-PL-SG-26-00873' },
      ],
    };

    const result = normalise(raw);
    expect(result.accepted).toEqual([]);
    expect(result.queued.find((field) => field.key === 'policy_no')?.reason).toBe('missing_mandatory');
  });

  it('queues a capture with no page or quote rather than accepting it', () => {
    const raw: RawExtraction = {
      documentType: 'slip',
      fields: [{ key: 'policy_no', value: 'NGS-PL-SG-26-00873', confidence: 0.95, page: 0, quote: '  ' }],
    };

    const result = normalise(raw);
    expect(result.accepted).toEqual([]);
    expect(result.queued[0]).toMatchObject({ key: 'policy_no', reason: 'missing_citation', page: 0 });
  });

  it('queues a high-confidence capture whose value is empty', () => {
    const raw: RawExtraction = {
      documentType: 'slip',
      fields: [{ key: 'premium_gross', value: '   ', confidence: 0.97, page: 1, quote: 'Premium: ' }],
    };

    const result = normalise(raw);
    expect(result.accepted).toEqual([]);
    expect(result.queued[0]).toMatchObject({ key: 'premium_gross', reason: 'empty_value', value: '' });
  });

  it('keeps the higher-confidence duplicate and rejects the other', () => {
    const raw: RawExtraction = {
      documentType: 'slip',
      fields: [
        { key: 'sum_insured', value: 'SGD 84,500,000', confidence: 0.72, page: 1, quote: 'Sum insured: SGD 84,500,000' },
        { key: 'sum_insured', value: 'SGD 91,200,000', confidence: 0.93, page: 2, quote: 'Sum insured: SGD 91,200,000' },
      ],
    };

    const result = normalise(raw);

    expect(result.accepted.map((field) => [field.key, field.value])).toEqual([
      ['sum_insured', 'SGD 91,200,000'],
    ]);
    expect(result.queued.map((field) => field.key)).not.toContain('sum_insured');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ key: 'sum_insured', code: 'duplicate_key' });
    expect(result.rejected[0]?.reason).toMatch(/page 2/);
  });

  it('trims whitespace on accepted keys and values', () => {
    const raw: RawExtraction = {
      documentType: 'slip',
      fields: [
        { key: '  policy_no  ', value: '  NGS-PL-SG-26-00873  ', confidence: 0.95, page: 1, quote: '  Policy number: NGS-PL-SG-26-00873  ' },
      ],
    };

    const result = normalise(raw);
    expect(result.accepted[0]).toMatchObject({
      key: 'policy_no',
      value: 'NGS-PL-SG-26-00873',
      quote: 'Policy number: NGS-PL-SG-26-00873',
    });
  });
});

describe('draft completeness', () => {
  it('counts only accepted mandatory keys', () => {
    const result = normalise(fixture('slip-cyber-2').raw);
    const draft = toDraftPolicy(result, 'doc-cyber');

    // 7 of 9 mandatory keys survived: sum_insured queued, premium_gross absent.
    expect(completeness(draft)).toBe(78);
  });

  it('is not diluted by queued non-mandatory keys', () => {
    const result = normalise(fixture('wording-cyber-2').raw);
    const draft = toDraftPolicy(result, 'doc-wording');

    expect(draft.unconfirmed).toEqual(['limit_aggregate', 'deductible']);
    expect(completeness(draft)).toBe(100);
  });

  it('never exceeds 100 or drops below 0', () => {
    for (const name of FIXTURE_NAMES) {
      const draft = toDraftPolicy(normalise(fixture(name).raw), `doc-${name}`);
      expect(completeness(draft)).toBeGreaterThanOrEqual(0);
      expect(completeness(draft)).toBeLessThanOrEqual(100);
    }
  });
});
