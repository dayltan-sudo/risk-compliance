import { z } from 'zod';

/**
 * Extraction contract for Salus document ingestion.
 *
 * The model returns a `RawExtraction`: a document type plus a flat list of field
 * captures. It never returns a policy record. Turning captures into a draft is
 * `validate.ts`'s job, and only captures that clear the confidence threshold and
 * carry a page and a quote are allowed to make that trip.
 *
 * Confidence is 0..1, not 0..100. Out-of-range values are rejected by the schema
 * rather than clamped: a model returning 85 is a prompt or model failure, and
 * quietly reading it as 0.85 would hide that from the audit trail.
 */

/** Document kinds Salus ingests. Drives which keys are mandatory. */
export const DOCUMENT_TYPES = [
  'slip',
  'wording',
  'schedule',
  'endorsement',
  'debit_note',
  'renewal',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

/**
 * Canonical policy field set (PRD P5). This order is the display order for the
 * validation queue and the draft record.
 *
 * `premium_gross` is the premium before tax and `premium_tax` is the tax
 * component. They are separate fields and must not be summed into one: the pair
 * has to survive to the policy record so the tax line stays auditable.
 */
export const CANONICAL_FIELD_KEYS = [
  'policy_no',
  'endorsement_no',
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
] as const;

export type CanonicalFieldKey = (typeof CANONICAL_FIELD_KEYS)[number];

export const canonicalFieldKeySchema = z.enum(CANONICAL_FIELD_KEYS);

const CANONICAL_FIELD_KEY_SET: ReadonlySet<string> = new Set(CANONICAL_FIELD_KEYS);

export function isCanonicalFieldKey(value: string): value is CanonicalFieldKey {
  return CANONICAL_FIELD_KEY_SET.has(value);
}

/**
 * Mandatory keys for a policy record (slip, schedule, renewal). Without these a
 * draft cannot be used, so `normalise` queues a placeholder for any that are
 * absent.
 */
export const MANDATORY_FIELD_KEYS: readonly CanonicalFieldKey[] = [
  'policy_no',
  'insured_entity',
  'carrier',
  'line_of_business',
  'inception',
  'expiry',
  'sum_insured',
  'premium_gross',
  'currency',
];

/**
 * Mandatory keys per document type.
 *
 * The policy-record set is only right for documents that create or restate a
 * policy. A wording carries no policy number, premium or sum insured: applying
 * the record set to one would queue nine phantom fields on every upload and bury
 * the captures a reviewer actually needs to look at. An endorsement carries a
 * narrow set because everything else is inherited from the policy it amends.
 */
export const MANDATORY_BY_DOCUMENT_TYPE: {
  readonly [K in DocumentType]: readonly CanonicalFieldKey[];
} = {
  slip: MANDATORY_FIELD_KEYS,
  schedule: MANDATORY_FIELD_KEYS,
  renewal: MANDATORY_FIELD_KEYS,
  debit_note: ['policy_no', 'insured_entity', 'carrier', 'premium_gross', 'premium_tax', 'currency'],
  endorsement: ['policy_no', 'endorsement_no', 'insured_entity', 'carrier', 'inception', 'expiry'],
  wording: ['carrier', 'line_of_business', 'key_exclusions'],
};

export function mandatoryKeysFor(documentType: DocumentType): readonly CanonicalFieldKey[] {
  return MANDATORY_BY_DOCUMENT_TYPE[documentType];
}

/**
 * One capture as the model emits it.
 *
 * `key` is deliberately a plain string, not `canonicalFieldKeySchema`. A model
 * that invents `policy_number` should cost one rejected field with a readable
 * reason, not fail the parse for the whole document. Admission of the key is
 * `normalise`'s decision, and the rejection is recorded.
 *
 * `page` and `quote` are required by the shape but not validated for usefulness
 * here: `page: 0` and `quote: ""` survive parsing, then fail admission, so the
 * reviewer sees why instead of losing the capture at the boundary.
 */
export const rawFieldSchema = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.number().finite().min(0).max(1),
  page: z.number().int().min(0),
  quote: z.string(),
});

export type RawField = z.infer<typeof rawFieldSchema>;

/**
 * A whole extraction. `fields` may be empty: a blank or unreadable page is a
 * legitimate result, and `normalise` reports it as missing mandatory keys rather
 * than a schema error.
 */
export const rawExtractionSchema = z.object({
  documentType: documentTypeSchema,
  fields: z.array(rawFieldSchema),
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;
