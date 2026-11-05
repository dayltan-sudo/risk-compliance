import {
  CANONICAL_FIELD_KEYS,
  isCanonicalFieldKey,
  type CanonicalFieldKey,
  type DocumentType,
} from './schema';
import {
  completeness as draftCompleteness,
  toDraftPolicy,
  type DraftPolicy,
  type DraftPolicyFields,
  type Normalised,
  type QueueReason,
} from './validate';

/**
 * In-memory validation queue for ingested documents.
 *
 * The queue holds the working draft and an append-only audit log. Posting takes
 * a snapshot: a later correction creates version 2 and leaves version 1 exactly
 * as it was posted. Nothing here writes to a database; the prototype restarts
 * empty.
 */

export type DocumentStatus = 'queued' | 'posted';

export interface NewQueuedDocument {
  documentId: string;
  /** Human label from the upload, e.g. the file name. */
  name: string;
  /** The routing result from `extractDocument`. The draft is derived from this. */
  normalised: Normalised;
}

export interface QueueItemSummary {
  documentId: string;
  name: string;
  documentType: DocumentType;
  status: DocumentStatus;
  /** Current working draft, 0-100. */
  completeness: number;
  unconfirmed: CanonicalFieldKey[];
  /** Latest posted version, 0 before the first post. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type AuditAction = 'document_enqueued' | 'field_accepted' | 'document_posted';

export interface AuditEvent {
  id: string;
  at: string;
  action: AuditAction;
  documentId: string;
  /** The version this event belongs to. Version 1 is the first post. */
  version: number;
  field?: CanonicalFieldKey;
  /** What the model produced, kept so a correction is provable. */
  extractedValue?: string | null;
  /** What the reviewer accepted. */
  acceptedValue?: string;
  /** The working value before this correction, when there was one. */
  previousValue?: string;
  reason?: QueueReason | 'reviewer_correction';
  summary: string;
}

export interface AcceptedFieldResult {
  documentId: string;
  field: CanonicalFieldKey;
  value: string;
  completeness: number;
  unconfirmed: CanonicalFieldKey[];
  auditEvent: AuditEvent;
}

export interface PostedDocument {
  documentId: string;
  name: string;
  documentType: DocumentType;
  version: number;
  fields: DraftPolicyFields;
  unconfirmed: readonly CanonicalFieldKey[];
  completeness: number;
  postedAt: string;
  /** The event created by this post. */
  auditEvent: AuditEvent;
  /** Every event for this document up to and including this post. */
  auditTrail: readonly AuditEvent[];
}

export type QueueErrorCode =
  | 'duplicate_document'
  | 'document_not_found'
  | 'invalid_document'
  | 'unknown_field'
  | 'empty_value';

export class QueueError extends Error {
  readonly code: QueueErrorCode;

  constructor(code: QueueErrorCode, message: string) {
    super(message);
    this.name = 'QueueError';
    this.code = code;
  }
}

interface QueueEntry {
  documentId: string;
  name: string;
  normalised: Normalised;
  /** Original capture values, keyed by field, including null for a key the model never returned. */
  extractedValues: Map<CanonicalFieldKey, string | null>;
  draft: DraftPolicy;
  status: DocumentStatus;
  versions: PostedDocument[];
  events: AuditEvent[];
  createdAt: string;
  updatedAt: string;
}

let eventSequence = 0;

function nextEventId(): string {
  eventSequence += 1;
  return `evt-${String(eventSequence).padStart(6, '0')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneDraft(draft: DraftPolicy): DraftPolicy {
  return { ...draft, unconfirmed: [...draft.unconfirmed] };
}

function collectExtractedValues(normalised: Normalised): Map<CanonicalFieldKey, string | null> {
  const values = new Map<CanonicalFieldKey, string | null>();
  for (const field of normalised.accepted) values.set(field.key, field.value);
  for (const field of normalised.queued) {
    if (!values.has(field.key)) values.set(field.key, field.value === '' ? null : field.value);
  }
  return values;
}

function fieldsOf(draft: DraftPolicy): DraftPolicyFields {
  const fields: DraftPolicyFields = {};
  for (const key of CANONICAL_FIELD_KEYS) {
    const value = draft[key];
    if (value !== undefined) fields[key] = value;
  }
  return fields;
}

export class ValidationQueue {
  private readonly entries = new Map<string, QueueEntry>();

  enqueue(doc: NewQueuedDocument): QueueItemSummary {
    const documentId = doc.documentId.trim();
    if (documentId === '') {
      throw new QueueError('invalid_document', 'documentId must not be empty');
    }
    if (this.entries.has(documentId)) {
      throw new QueueError('duplicate_document', `document "${documentId}" is already in the validation queue`);
    }

    const at = nowIso();
    const draft = cloneDraft(toDraftPolicy(doc.normalised, documentId));
    const event: AuditEvent = {
      id: nextEventId(),
      at,
      action: 'document_enqueued',
      documentId,
      version: 0,
      summary: `Enqueued "${doc.name}" as ${doc.normalised.documentType} with ${doc.normalised.queued.length} field(s) needing review`,
    };

    this.entries.set(documentId, {
      documentId,
      name: doc.name,
      normalised: doc.normalised,
      extractedValues: collectExtractedValues(doc.normalised),
      draft,
      status: 'queued',
      versions: [],
      events: [event],
      createdAt: at,
      updatedAt: at,
    });

    return this.summarise(this.require(documentId));
  }

  list(): QueueItemSummary[] {
    return [...this.entries.values()].map((entry) => this.summarise(entry));
  }

  get(documentId: string): QueueItemSummary | undefined {
    const entry = this.entries.get(documentId);
    return entry === undefined ? undefined : this.summarise(entry);
  }

  history(documentId: string): readonly AuditEvent[] {
    return [...this.require(documentId).events];
  }

  /**
   * Accept a reviewer's value for one field. This is the only way a value below
   * the confidence threshold, or a key the model omitted, can enter the draft.
   *
   * The original extracted value is preserved on the audit event even when the
   * same key is corrected more than once.
   */
  accept(documentId: string, field: string, value: string): AcceptedFieldResult {
    const entry = this.require(documentId);
    const key = field.trim();

    if (!isCanonicalFieldKey(key)) {
      throw new QueueError('unknown_field', `"${field}" is not in the canonical policy field set`);
    }

    const acceptedValue = value.trim();
    if (acceptedValue === '') {
      throw new QueueError('empty_value', `value for "${key}" must not be empty`);
    }

    const at = nowIso();
    const queued = entry.normalised.queued.find((candidate) => candidate.key === key);
    const reason: QueueReason | 'reviewer_correction' = queued?.reason ?? 'reviewer_correction';
    const extractedValue = entry.extractedValues.get(key) ?? null;
    const previousValue = entry.draft[key];

    const unconfirmed = entry.draft.unconfirmed.filter((candidate) => candidate !== key);
    entry.draft = { ...entry.draft, [key]: acceptedValue, unconfirmed };
    entry.status = 'queued';
    entry.updatedAt = at;

    const event: AuditEvent = {
      id: nextEventId(),
      at,
      action: 'field_accepted',
      documentId,
      version: entry.versions.length + 1,
      field: key,
      extractedValue,
      acceptedValue,
      ...(previousValue === undefined ? {} : { previousValue }),
      reason,
      summary: `Accepted ${key} as "${acceptedValue}" (extracted ${extractedValue === null ? 'nothing' : `"${extractedValue}"`}, ${reason})`,
    };
    entry.events.push(event);

    return {
      documentId,
      field: key,
      value: acceptedValue,
      completeness: draftCompleteness(entry.draft),
      unconfirmed: [...unconfirmed],
      auditEvent: event,
    };
  }

  /**
   * Post the current working draft as a new immutable version. Re-posting
   * appends another version rather than editing the previous one.
   */
  post(documentId: string): PostedDocument {
    const entry = this.require(documentId);
    const at = nowIso();
    const version = entry.versions.length + 1;
    const unconfirmed = [...entry.draft.unconfirmed];
    const fields = Object.freeze(fieldsOf(entry.draft));

    const event: AuditEvent = {
      id: nextEventId(),
      at,
      action: 'document_posted',
      documentId,
      version,
      summary: `Posted ${entry.draft.documentType} version ${version} with ${unconfirmed.length} unconfirmed field(s)`,
    };

    const posted: PostedDocument = {
      documentId,
      name: entry.name,
      documentType: entry.draft.documentType,
      version,
      fields,
      unconfirmed: Object.freeze(unconfirmed),
      completeness: draftCompleteness(entry.draft),
      postedAt: at,
      auditEvent: event,
      auditTrail: Object.freeze([...entry.events, event]),
    };

    entry.versions.push(posted);
    entry.events.push(event);
    entry.status = 'posted';
    entry.updatedAt = at;

    return posted;
  }

  /** Test and demo helper. The real app starts empty and holds state in memory. */
  reset(): void {
    this.entries.clear();
  }

  private require(documentId: string): QueueEntry {
    const entry = this.entries.get(documentId);
    if (entry === undefined) {
      throw new QueueError('document_not_found', `no document with id "${documentId}" in the validation queue`);
    }
    return entry;
  }

  private summarise(entry: QueueEntry): QueueItemSummary {
    return {
      documentId: entry.documentId,
      name: entry.name,
      documentType: entry.draft.documentType,
      status: entry.status,
      completeness: draftCompleteness(entry.draft),
      unconfirmed: [...entry.draft.unconfirmed],
      version: entry.versions.at(-1)?.version ?? 0,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }
}
