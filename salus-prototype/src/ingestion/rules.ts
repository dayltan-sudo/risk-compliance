import type { CanonicalFieldKey, DocumentType, RawExtraction, RawField } from './schema';

/**
 * Deterministic field extraction for when no model is configured.
 *
 * This is the offline path, not a pretence of intelligence: it reads labelled
 * lines ("Sum Insured: SGD 80,000,000") that a broker slip, schedule or debit
 * note actually contains, and it says so in the response. Anything it cannot
 * read with a labelled line stays absent and is reported as a missing mandatory
 * field, which is the same signal a model's silence produces.
 *
 * Confidence is honest about the evidence:
 * - 0.95 label and a value that passes the type check for that field
 * - 0.62 label present, value present but not in the expected shape (queued for review)
 * A clean slip therefore admits its fields, and a sloppy one parks the doubtful
 * ones in front of the reviewer, which is the behaviour the queue exists for.
 */

interface LabelRule {
  key: CanonicalFieldKey;
  /** Matched against the lower-cased label, anchored at the start. */
  pattern: RegExp;
  kind: 'text' | 'money' | 'date' | 'integer' | 'percent' | 'currency';
}

/**
 * Order matters: the more specific label wins, so BI cover is checked before a
 * bare "sum insured", and premium tax before premium.
 */
const LABEL_RULES: readonly LabelRule[] = [
  { key: 'bi_sum_insured', pattern: /^(bi\s+sum\s+insured|business\s+interruption\s+sum\s+insured)\b/, kind: 'money' },
  { key: 'limit_aggregate', pattern: /^(aggregate\s+limit|annual\s+aggregate|aggregate)\b/, kind: 'money' },
  {
    key: 'limit_occurrence',
    pattern: /^(limit\s+of\s+(indemnity|liability)|any\s+one\s+occurrence|occurrence\s+limit|per\s+occurrence)\b/,
    kind: 'money',
  },
  { key: 'premium_tax', pattern: /^(tax|gst|ippt|stamp\s+duty|premium\s+tax)\b/, kind: 'money' },
  { key: 'premium_gross', pattern: /^(gross\s+premium|premium)\b/, kind: 'money' },
  { key: 'sum_insured', pattern: /^(sum\s+insured|sum\s+assured|insured\s+value|tis)\b/, kind: 'money' },
  { key: 'deductible', pattern: /^(deductible|excess|self[- ]insured\s+retention)\b/, kind: 'money' },
  { key: 'tiv', pattern: /^(tiv|total\s+insured\s+value)\b/, kind: 'money' },
  { key: 'pml', pattern: /^(pml|probable\s+maximum\s+loss)\b/, kind: 'money' },
  { key: 'policy_no', pattern: /^(policy\s*(no\.?|number|#)|policy)\b/, kind: 'text' },
  { key: 'endorsement_no', pattern: /^(endorsement\s*(no\.?|number|#)|endt\.?)\b/, kind: 'text' },
  { key: 'insured_entity', pattern: /^(insured(\s+entity)?|named\s+insured|assured|policyholder)\b/, kind: 'text' },
  { key: 'carrier', pattern: /^(insurer|carrier|underwriter)\b/, kind: 'text' },
  {
    key: 'line_of_business',
    pattern: /^(line\s+of\s+business|class\s+of\s+business|coverage|insuring\s+clause)\b/,
    kind: 'text',
  },
  { key: 'inception', pattern: /^(inception|effective(\s+date)?|commencement|period\s+from|from)\b/, kind: 'date' },
  { key: 'expiry', pattern: /^(expiry|expiration|expiring|period\s+to|to)\b/, kind: 'date' },
  { key: 'site_name', pattern: /^(site|location|risk\s+address|property|premises)\b/, kind: 'text' },
  { key: 'country', pattern: /^country\b/, kind: 'text' },
  { key: 'currency', pattern: /^currency\b/, kind: 'currency' },
  { key: 'key_exclusions', pattern: /^(key\s+exclusions?|exclusions?|excluded\s+perils?)\b/, kind: 'text' },
];

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const MONEY = /(?:SGD|USD|EUR|GBP|AUD|CNY|JPY|VND|S\$|\$)?\s*-?\d[\d,]*(?:\.\d+)?\s*(?:m|mn|bn|k|million|billion|thousand)?/i;

export function normaliseDate(raw: string): string | null {
  const text = raw.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1');

  const iso = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (iso !== null) {
    const [, y, m, d] = iso;
    return formatIso(Number(y), Number(m), Number(d));
  }

  const dmy = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(text);
  if (dmy !== null) {
    const [, d, m, y] = dmy;
    return formatIso(Number(y), Number(m), Number(d));
  }

  const named = /(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/.exec(text);
  if (named !== null) {
    const [, d, month, y] = named;
    const mm = MONTHS[(month ?? '').slice(0, 3).toLowerCase()];
    if (mm !== undefined) return formatIso(Number(y), Number(mm), Number(d));
  }

  const namedFirst = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(text);
  if (namedFirst !== null) {
    const [, month, d, y] = namedFirst;
    const mm = MONTHS[(month ?? '').slice(0, 3).toLowerCase()];
    if (mm !== undefined) return formatIso(Number(y), Number(mm), Number(d));
  }

  return null;
}

function formatIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function inferDocumentType(pages: readonly string[]): DocumentType {
  // Classify from the title line, not the whole document: a renewal slip that
  // carries an "Endorsement No" field is still a renewal.
  const lines = pages
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, 8);

  const title = lines.find((line) =>
    /\b(slip|schedule|wording|endorsement|endt\.?|debit\s+note|renewal)\b/i.test(line),
  );
  const text = (title ?? '').toLowerCase();

  if (/debit\s+note/.test(text)) return 'debit_note';
  if (/wording|insuring\s+clauses?/.test(text)) return 'wording';
  if (/renewal/.test(text)) return 'renewal';
  if (/endorsement|endt\./.test(text)) return 'endorsement';
  if (/schedule/.test(text)) return 'schedule';
  if (/slip/.test(text)) return 'slip';

  return 'slip';
}

/** Splits "Sum Insured: SGD 80,000,000" into its label and its value. */
function splitLabel(line: string): { label: string; value: string } | null {
  const match = /^([A-Za-z][A-Za-z0-9 .'()/#&-]{1,60}?)\s*(?::|\u2013|\u2014|-{1,2}|\t|\s{2,}|\|)\s*(.+)$/.exec(
    line.trim(),
  );
  if (match === null) return null;
  const label = (match[1] ?? '').trim();
  const value = (match[2] ?? '').trim();
  if (label === '' || value === '') return null;
  return { label, value };
}

function ruleFor(label: string): LabelRule | undefined {
  const lower = label.toLowerCase();
  return LABEL_RULES.find((rule) => rule.pattern.test(lower));
}

function valueFor(kind: LabelRule['kind'], raw: string): { value: string; strong: boolean } | null {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value === '') return null;

  switch (kind) {
    case 'date': {
      const normalised = normaliseDate(value);
      return normalised === null ? { value, strong: false } : { value: normalised, strong: true };
    }
    case 'money': {
      const match = MONEY.exec(value);
      if (match === null || !/\d/.test(match[0])) return { value, strong: false };
      return { value: match[0].trim(), strong: true };
    }
    case 'integer':
    case 'percent': {
      const match = /-?\d+(?:\.\d+)?%?/.exec(value);
      return match === null ? { value, strong: false } : { value: match[0], strong: true };
    }
    case 'currency': {
      const code = /(SGD|USD|EUR|GBP|AUD|CNY|JPY|VND)/i.exec(value);
      if (code !== null) return { value: code[1]!.toUpperCase(), strong: true };
      if (/S\$/.test(value)) return { value: 'SGD', strong: true };
      return { value, strong: false };
    }
    default:
      return { value, strong: true };
  }
}

/**
 * Reads labelled lines across the document's pages. One capture per canonical
 * key: the first strong reading wins, and a later weak reading never displaces
 * it.
 */
export function extractByRules(pages: readonly string[]): RawExtraction {
  const fields = new Map<CanonicalFieldKey, RawField>();
  const text = pages.join('\n');

  pages.forEach((page, index) => {
    for (const line of page.split(/\r?\n/)) {
      if (line.trim() === '') continue;
      const split = splitLabel(line);
      if (split === null) continue;

      const rule = ruleFor(split.label);
      if (rule === undefined) continue;

      const parsed = valueFor(rule.kind, split.value);
      if (parsed === null) continue;
      // A typed field whose value does not parse ("to be advised" for an amount)
      // is not a capture. Leaving it absent is honest: the mandatory-field check
      // then queues the field for the reviewer, instead of a draft carrying a
      // sentence where a number belongs.
      if (!parsed.strong && rule.kind !== 'text') continue;

      const existing = fields.get(rule.key);
      const confidence = parsed.strong ? 0.95 : 0.62;
      if (existing !== undefined && (existing.confidence >= confidence || existing.confidence >= 0.95)) continue;

      fields.set(rule.key, {
        key: rule.key,
        value: parsed.value,
        confidence,
        page: index + 1,
        quote: line.trim().slice(0, 240),
      });
    }
  });

  // A currency is often only present inside an amount; promote it so the record
  // does not queue for a field the document clearly states.
  if (!fields.has('currency')) {
    const money = /\b(SGD|USD|EUR|GBP|AUD|CNY|JPY|VND)\b/.exec(text);
    if (money !== null) {
      fields.set('currency', {
        key: 'currency',
        value: money[1]!.toUpperCase(),
        confidence: 0.9,
        page: 1,
        quote: money[0],
      });
    }
  }

  return { documentType: inferDocumentType(pages), fields: [...fields.values()] };
}
