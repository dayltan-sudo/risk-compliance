import {
  CANONICAL_FIELD_KEYS,
  isCanonicalFieldKey,
  mandatoryKeysFor,
  type CanonicalFieldKey,
  type DocumentType,
  type RawExtraction,
  type RawField,
} from './schema';

/**
 * Routing an extraction into a draft record.
 *
 * Three outcomes per capture:
 *   accepted - confidence at or above the threshold, with a page and a quote.
 *              Only accepted captures reach the draft.
 *   queued   - a real capture the reviewer has to confirm: below the threshold,
 *              uncited, empty, or a mandatory key that the model never returned.
 *   rejected - never a candidate: unknown key, or a duplicate reading that lost
 *              to a higher-confidence one.
 *
 * `rejected` is key-and-reason only by design; the capture itself is not carried
 * forward, so nothing downstream can accidentally use it.
 */

/** A capture admitted past the admission rules. */
export interface Field {
  key: CanonicalFieldKey;
  value: string;
  confidence: number;
  page: number;
  quote: string;
}

export type QueueReason =
  | 'low_confidence'
  | 'missing_mandatory'
  | 'missing_citation'
  | 'empty_value';

/** A field waiting on a human. `reason` says why it is here. */
export type QueuedField = Field & { reason: QueueReason };

export type RejectionCode = 'unknown_key' | 'duplicate_key';

export interface RejectedField {
  /** The key exactly as the model emitted it, so the audit trail is faithful. */
  key: string;
  reason: string;
  code: RejectionCode;
}

export interface Normalised {
  documentType: DocumentType;
  accepted: Field[];
  queued: QueuedField[];
  rejected: RejectedField[];
}

export interface NormaliseOptions {
  /** Minimum confidence for acceptance. Below this, a capture is queued. */
  threshold?: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

const CANONICAL_ORDER: ReadonlyMap<CanonicalFieldKey, number> = new Map(
  CANONICAL_FIELD_KEYS.map((key, index) => [key, index] as const),
);

export function normalise(raw: RawExtraction, opts: NormaliseOptions = {}): Normalised {
  const threshold = opts.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError(`threshold must be between 0 and 1, got ${threshold}`);
  }

  const mandatory = new Set<CanonicalFieldKey>(mandatoryKeysFor(raw.documentType));

  /*
   * Duplicates: a model can return the same key twice with different readings
   * (two columns of a limits table, a value restated in an endorsement). Keep
   * the highest-confidence reading and reject the rest. First occurrence wins a
   * tie, so the result does not depend on sort stability.
   */
  const winnerIndexByKey = new Map<CanonicalFieldKey, number>();
  raw.fields.forEach((field, index) => {
    const key = field.key.trim();
    if (!isCanonicalFieldKey(key)) return;
    const winner = winnerIndexByKey.get(key);
    if (winner === undefined) {
      winnerIndexByKey.set(key, index);
      return;
    }
    const incumbent: RawField | undefined = raw.fields[winner];
    if (incumbent !== undefined && field.confidence > incumbent.confidence) {
      winnerIndexByKey.set(key, index);
    }
  });

  const accepted: Field[] = [];
  const queued: QueuedField[] = [];
  const rejected: RejectedField[] = [];
  const acceptedKeys = new Set<CanonicalFieldKey>();
  const queuedKeys = new Set<CanonicalFieldKey>();

  raw.fields.forEach((rawField, index) => {
    const key = rawField.key.trim();

    if (!isCanonicalFieldKey(key)) {
      rejected.push({
        key: rawField.key,
        code: 'unknown_key',
        reason: `"${rawField.key}" is not in the canonical policy field set`,
      });
      return;
    }

    if (winnerIndexByKey.get(key) !== index) {
      const winner = winnerIndexByKey.get(key);
      const winning: RawField | undefined = winner === undefined ? undefined : raw.fields[winner];
      rejected.push({
        key,
        code: 'duplicate_key',
        reason:
          winning === undefined
            ? `duplicate capture of "${key}"`
            : `duplicate capture of "${key}"; kept the higher-confidence reading on page ${winning.page}`,
      });
      return;
    }

    const field: Field = {
      key,
      value: rawField.value.trim(),
      confidence: rawField.confidence,
      page: rawField.page,
      quote: rawField.quote.trim(),
    };

    if (field.value === '') {
      queued.push({ ...field, reason: 'empty_value' });
      queuedKeys.add(key);
      return;
    }

    if (field.confidence < threshold) {
      queued.push({ ...field, reason: 'low_confidence' });
      queuedKeys.add(key);
      return;
    }

    if (field.page < 1 || field.quote === '') {
      queued.push({ ...field, reason: 'missing_citation' });
      queuedKeys.add(key);
      return;
    }

    accepted.push(field);
    acceptedKeys.add(key);
  });

  // A mandatory key the model never returned at all. `page: 0` and an empty
  // quote mark it as synthetic; it is the one queued entry that has no source.
  for (const key of mandatory) {
    if (acceptedKeys.has(key) || queuedKeys.has(key)) continue;
    queued.push({ key, value: '', confidence: 0, page: 0, quote: '', reason: 'missing_mandatory' });
  }

  return { documentType: raw.documentType, accepted, queued, rejected };
}

/** Accepted fields only. Queued values are never copied across. */
export type DraftPolicyFields = { [K in CanonicalFieldKey]?: string };

export type DraftPolicy = {
  documentId: string;
  documentType: DocumentType;
  /** Queued keys, canonical order, deduplicated. */
  unconfirmed: CanonicalFieldKey[];
} & DraftPolicyFields;

export function toDraftPolicy(normalised: Normalised, documentId: string): DraftPolicy {
  const fields: DraftPolicyFields = {};
  for (const field of normalised.accepted) {
    fields[field.key] = field.value;
  }

  const unconfirmed = [...new Set(normalised.queued.map((field) => field.key))].sort(
    (a, b) => (CANONICAL_ORDER.get(a) ?? 0) - (CANONICAL_ORDER.get(b) ?? 0),
  );

  return {
    documentId,
    documentType: normalised.documentType,
    ...fields,
    unconfirmed,
  };
}

/**
 * Percentage of the document type's mandatory keys present in the draft, 0-100,
 * rounded to a whole number for display. A key counts only when it survived as
 * an accepted field with a non-empty value; a queued key never counts.
 */
export function completeness(draft: DraftPolicy): number {
  const mandatory = mandatoryKeysFor(draft.documentType);
  if (mandatory.length === 0) return 100;

  const present = mandatory.filter((key) => {
    const value = draft[key];
    return typeof value === 'string' && value.trim() !== '';
  }).length;

  return Math.round((present / mandatory.length) * 100);
}
