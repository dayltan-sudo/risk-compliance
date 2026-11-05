/// <reference types="vite/client" />
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import endorsementText from '../../../fixtures/documents/endorsement-property-1.txt?raw';
import scheduleText from '../../../fixtures/documents/schedule-marine-3.txt?raw';
import slipCyberText from '../../../fixtures/documents/slip-cyber-2.txt?raw';
import slipPropertyText from '../../../fixtures/documents/slip-property-1.txt?raw';
import wordingText from '../../../fixtures/documents/wording-cyber-2.txt?raw';
import type { QueueItemSummary, PostedDocument } from '../../ingestion/queue';
import type { DocumentType } from '../../ingestion/schema';
import type { Field, QueuedField, QueueReason, RejectedField } from '../../ingestion/validate';
import { PageHeader } from '../components/PageHeader';
import { recordPosted } from '../layout/posted';
import { Card, DataTable, KpiTile, Tag } from '../ui';
import type { Column, TagTone } from '../ui';

/**
 * P5 document inbox.
 *
 * The only write surface in the prototype: a fixture is loaded, extracted,
 * reviewed and posted. Every value the page shows comes back from the API; the
 * page never re-derives completeness, confidence or the version number.
 *
 * The API is wired to `fixtureExtractionClient` in `server/index.ts`, so a
 * document id that matches a fixture name replays `fixtures/expected/<id>.json`
 * instead of calling a model. That is a demo path and the page says so.
 */

/* ------------------------------------------------------------------ fixtures */

export interface FixtureOption {
  /** Posted as the document id, so the fixture client can replay it. */
  id: string;
  /** Human file name, used as the queue label. */
  file: string;
  title: string;
  description: string;
  documentType: DocumentType;
  /** Raw text, imported with Vite so the page needs no extra endpoint. */
  text: string;
}

export const FIXTURES: readonly FixtureOption[] = [
  {
    id: 'slip-cyber-2',
    file: 'slip-cyber-2.txt',
    title: 'Cyber liability slip',
    description:
      'Kestrel slip for Sentinel Grid. Low-confidence captures plus a missing gross premium keep the review queue busy.',
    documentType: 'slip',
    text: slipCyberText,
  },
  {
    id: 'slip-property-1',
    file: 'slip-property-1.txt',
    title: 'Property ISR slip',
    description:
      'Northgate slip for Orchard Lane. Every capture clears the threshold, so it posts without a correction.',
    documentType: 'slip',
    text: slipPropertyText,
  },
  {
    id: 'schedule-marine-3',
    file: 'schedule-marine-3.txt',
    title: 'Marine cargo schedule',
    description: 'Harbourline schedule for Keel Marine. Multi-page, USD, with a zero-rated tax line.',
    documentType: 'schedule',
    text: scheduleText,
  },
  {
    id: 'endorsement-property-1',
    file: 'endorsement-property-1.txt',
    title: 'Property endorsement',
    description:
      'Northgate endorsement amending an existing property policy. The mandatory set is narrow for endorsements.',
    documentType: 'endorsement',
    text: endorsementText,
  },
  {
    id: 'wording-cyber-2',
    file: 'wording-cyber-2.txt',
    title: 'Cyber policy wording',
    description:
      'Kestrel wording. A wording has a narrow mandatory set, so completeness can reach its ceiling while fields still need review.',
    documentType: 'wording',
    text: wordingText,
  },
];

const DEFAULT_FIXTURE_ID = 'slip-cyber-2';

/* -------------------------------------------------------------- field labels */

export const FIELD_LABELS: Readonly<Record<string, string>> = {
  policy_no: 'Policy number',
  endorsement_no: 'Endorsement number',
  insured_entity: 'Insured',
  carrier: 'Carrier',
  line_of_business: 'Line of business',
  inception: 'Inception',
  expiry: 'Expiry',
  sum_insured: 'Sum insured',
  limit_occurrence: 'Limit, any one claim',
  limit_aggregate: 'Limit, aggregate',
  deductible: 'Deductible',
  premium_gross: 'Gross premium',
  premium_tax: 'Premium tax',
  currency: 'Currency',
  site_name: 'Site',
  country: 'Country',
  tiv: 'TIV',
  pml: 'PML',
  bi_sum_insured: 'BI sum insured',
  key_exclusions: 'Key exclusions',
};

/** Canonical key to label; unknown keys fall back to title-cased words. */
export function formatFieldKey(key: string): string {
  const known = FIELD_LABELS[key];
  if (known !== undefined) return known;

  const words = key.split('_').filter(Boolean);
  if (words.length === 0) return key;
  return words
    .map((word, index) =>
      index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word,
    )
    .join(' ');
}

const REASON_LABELS: Readonly<Record<string, string>> = {
  low_confidence: 'Low confidence',
  missing_mandatory: 'Missing mandatory',
  missing_citation: 'No citation',
  empty_value: 'Empty value',
  reviewer_correction: 'Reviewer correction',
};

export function reasonLabel(reason: string): string {
  const known = REASON_LABELS[reason];
  if (known !== undefined) return known;
  return formatFieldKey(reason);
}

const DOCUMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  slip: 'Slip',
  wording: 'Wording',
  schedule: 'Schedule',
  endorsement: 'Endorsement',
  debit_note: 'Debit note',
  renewal: 'Renewal',
};

export function formatDocumentType(documentType: string): string {
  return DOCUMENT_TYPE_LABELS[documentType] ?? formatFieldKey(documentType);
}

/* ------------------------------------------------------------------ display */

/** 0..1 from the API as a whole percentage. Null means there was no capture. */
export function formatConfidence(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined || !Number.isFinite(confidence)) {
    return '—';
  }
  return `${Math.round(confidence * 100)}%`;
}

export function completenessLabel(completeness: number | null | undefined): string {
  if (completeness === null || completeness === undefined || !Number.isFinite(completeness)) {
    return '—';
  }
  return `${Math.round(completeness)}% complete`;
}

/** Display tone only; the value itself always comes from the API. */
export function completenessTone(completeness: number): TagTone {
  if (!Number.isFinite(completeness)) return 'neutral';
  if (completeness >= 100) return 'low';
  if (completeness >= 60) return 'medium';
  return 'critical';
}

export interface AcceptedRow {
  key: string;
  label: string;
  value: string;
  confidence: number | null;
  page: number | null;
  /** True when a reviewer supplied or confirmed the value in this session. */
  reviewed: boolean;
  quote: string;
}

export interface QueuedRow {
  key: string;
  label: string;
  value: string;
  reason: QueueReason;
  reasonLabel: string;
  /** The extracted confidence; null for a key the model never returned. */
  confidence: number | null;
  page: number | null;
}

export function buildAcceptedRow(field: Field, reviewed = false): AcceptedRow {
  return {
    key: field.key,
    label: formatFieldKey(field.key),
    value: field.value,
    confidence: field.confidence,
    page: field.page >= 1 ? field.page : null,
    reviewed,
    quote: field.quote,
  };
}

export function buildQueuedRow(field: QueuedField): QueuedRow {
  return {
    key: field.key,
    label: formatFieldKey(field.key),
    value: field.value,
    reason: field.reason,
    reasonLabel: reasonLabel(field.reason),
    confidence: field.reason === 'missing_mandatory' ? null : field.confidence,
    page: field.page >= 1 ? field.page : null,
  };
}

/**
 * Split an extraction into the two review lists. A key that somehow appears in
 * both stays accepted only: the accepted capture is the draft value.
 */
export function splitFields(
  accepted: readonly Field[],
  queued: readonly QueuedField[],
): { accepted: AcceptedRow[]; queued: QueuedRow[] } {
  const acceptedKeys = new Set(accepted.map((field) => field.key));

  return {
    accepted: accepted.map((field) => buildAcceptedRow(field)),
    queued: queued
      .filter((field) => !acceptedKeys.has(field.key))
      .map((field) => buildQueuedRow(field)),
  };
}

/** The accepted row a queued field becomes after the reviewer accepts it. */
export function acceptedRowFromQueued(row: QueuedRow, value: string): AcceptedRow {
  return {
    key: row.key,
    label: row.label,
    value,
    confidence: row.confidence,
    page: row.page,
    reviewed: true,
    quote: '',
  };
}

export interface CorrectionRow {
  key: string;
  label: string;
  before: string;
  after: string;
  reason: string;
  /** False when the reviewer accepted the extracted value unchanged. */
  changed: boolean;
}

export interface PostView {
  headline: string;
  corrections: CorrectionRow[];
  corrected: number;
  confirmed: number;
  outstanding: number;
}

/** Field-level audit events belonging to the version that was just posted. */
export function correctionRows(
  posted: Pick<PostedDocument, 'version' | 'auditTrail'>,
): CorrectionRow[] {
  const rows: CorrectionRow[] = [];

  for (const event of posted.auditTrail) {
    if (event.action !== 'field_accepted') continue;
    if (event.field === undefined) continue;
    if (event.version !== posted.version) continue;

    const before = event.previousValue ?? event.extractedValue ?? '';
    const after = event.acceptedValue ?? '';

    rows.push({
      key: event.field,
      label: formatFieldKey(event.field),
      before: before === '' ? '—' : before,
      after: after === '' ? '—' : after,
      reason: reasonLabel(event.reason ?? 'reviewer_correction'),
      changed: before !== after,
    });
  }

  return rows;
}

function fieldCount(count: number): string {
  return `${count} ${count === 1 ? 'field' : 'fields'}`;
}

/** The demo's closing line, built only from the post response. */
export function postHeadline(
  posted: Pick<PostedDocument, 'version' | 'unconfirmed' | 'auditTrail'>,
): string {
  const corrected = correctionRows(posted).filter((row) => row.changed).length;
  const outstanding = posted.unconfirmed.length;

  return [
    `Posted as version ${posted.version}`,
    `${fieldCount(corrected)} corrected by you`,
    `${fieldCount(outstanding)} still ${outstanding === 1 ? 'needs' : 'need'} review`,
  ].join(' · ');
}

export function buildPostView(posted: PostedDocument): PostView {
  const corrections = correctionRows(posted);

  return {
    headline: postHeadline(posted),
    corrections,
    corrected: corrections.filter((row) => row.changed).length,
    confirmed: corrections.filter((row) => !row.changed).length,
    outstanding: posted.unconfirmed.length,
  };
}

/* --------------------------------------------------------------------- api */

interface CreateDocumentResponse extends QueueItemSummary {
  accepted: Field[];
  queued: QueuedField[];
  rejected: RejectedField[];
}

/** The upload endpoint returns the same shape plus how the file was read. */
interface UploadResponse extends CreateDocumentResponse {
  extraction: {
    source: 'model' | 'rules';
    kind: 'pdf' | 'docx' | 'txt';
    pages: number;
    documentType: string;
    bytes: number;
  };
}

interface QueueListResponse {
  documents: QueueItemSummary[];
  total: number;
}

interface AcceptFieldResponse {
  documentId: string;
  field: string;
  value: string;
  completeness: number;
  unconfirmed: string[];
}

interface ExtractionView {
  documentId: string;
  name: string;
  documentType: DocumentType;
  completeness: number;
  accepted: AcceptedRow[];
  queued: QueuedRow[];
  rejected: RejectedField[];
}

export interface ApiFailure {
  status: number;
  message: string;
  code?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim();
    let code: string | undefined;

    try {
      const body = (await response.json()) as { error?: unknown; code?: unknown };
      if (typeof body.error === 'string' && body.error !== '') message = body.error;
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // Keep the status line when the body is not JSON.
    }

    throw new ApiError(response.status, message, code);
  }

  return (await response.json()) as T;
}

function toFailure(cause: unknown): ApiFailure {
  if (cause instanceof ApiError) {
    return cause.code === undefined
      ? { status: cause.status, message: cause.message }
      : { status: cause.status, message: cause.message, code: cause.code };
  }
  return { status: 0, message: cause instanceof Error ? cause.message : String(cause) };
}

/**
 * The two error states the brief calls out. 503 is a wiring problem, not a
 * document problem, so it gets the plain sentence and the server text as detail.
 */
export function describeFailure(
  status: number,
  message: string,
): { title: string; detail?: string } {
  if (status === 503) {
    return { title: 'extraction client not configured', detail: message };
  }
  return { title: message };
}

const QUEUE_TIME = new Intl.DateTimeFormat('en-SG', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Singapore',
});

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : QUEUE_TIME.format(date);
}

/* ------------------------------------------------------------------- page */

const queueColumns: Array<Column<QueueItemSummary>> = [
  {
    key: 'documentId',
    header: 'Document id',
    width: '26%',
    render: (item) => (
      <span className="sal-mono" style={monoCellStyle} title={item.documentId}>
        {item.documentId}
      </span>
    ),
  },
  {
    key: 'name',
    header: 'Name',
    render: (item) => <span>{item.name}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    width: '112px',
    render: (item) => (
      <Tag tone={item.status === 'posted' ? 'low' : 'medium'} dot>
        {item.status}
      </Tag>
    ),
  },
  {
    key: 'completeness',
    header: 'Completeness',
    numeric: true,
    width: '156px',
    render: (item) => completenessLabel(item.completeness),
  },
  {
    key: 'version',
    header: 'Version',
    numeric: true,
    width: '88px',
    render: (item) => (item.version === 0 ? '—' : `v${item.version}`),
  },
];

/** Where the accepted values came from: a model read or the rules matcher. */
function acceptedColumns(origin: 'Model' | 'Rules' | 'Replay'): Array<Column<AcceptedRow>> {
  return [
  {
    key: 'key',
    header: 'Field',
    width: '26%',
    render: (row) => (
      <span>
        <span style={fieldLabelStyle}>{row.label}</span>
        <span className="sal-mono" style={fieldKeyStyle}>
          {row.key}
        </span>
      </span>
    ),
  },
  {
    key: 'value',
    header: 'Value',
    render: (row) => <span style={valueStyle}>{row.value}</span>,
  },
  {
    key: 'confidence',
    header: 'Confidence',
    numeric: true,
    width: '112px',
    render: (row) => formatConfidence(row.confidence),
  },
  {
    key: 'page',
    header: 'Page',
    numeric: true,
    width: '76px',
    render: (row) => (row.page === null ? '—' : row.page),
  },
  {
    key: 'reviewed',
    header: 'Origin',
    width: '100px',
    render: (row) =>
      row.reviewed ? (
        <Tag tone="accent">You</Tag>
      ) : (
        <Tag tone="neutral">{origin}</Tag>
      ),
  },
  ];
}

const correctionColumns: Array<Column<CorrectionRow>> = [
  {
    key: 'key',
    header: 'Field',
    width: '26%',
    render: (row) => (
      <span>
        <span style={fieldLabelStyle}>{row.label}</span>
        <span className="sal-mono" style={fieldKeyStyle}>
          {row.key}
        </span>
      </span>
    ),
  },
  {
    key: 'before',
    header: 'Before',
    render: (row) => (
      <span style={row.changed ? beforeStyle : unchangedBeforeStyle}>{row.before}</span>
    ),
  },
  {
    key: 'after',
    header: 'After',
    render: (row) => <span style={afterStyle}>{row.after}</span>,
  },
  {
    key: 'reason',
    header: 'Audit reason',
    width: '190px',
    render: (row) => <span style={metaStyle}>{row.reason}</span>,
  },
];

export function DocumentsPage(): JSX.Element {
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(DEFAULT_FIXTURE_ID);
  const [loadedFixtureId, setLoadedFixtureId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [extraction, setExtraction] = useState<ExtractionView | null>(null);
  const [uploadInfo, setUploadInfo] = useState<UploadResponse['extraction'] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [queuedValues, setQueuedValues] = useState<Record<string, string>>({});
  const [posted, setPosted] = useState<PostedDocument | null>(null);
  const [queue, setQueue] = useState<QueueListResponse | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const body = await requestJson<QueueListResponse>('/api/documents');
      setQueue(body);
      setQueueError(null);
    } catch (cause) {
      setQueueError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const selectedFixture = FIXTURES.find((fixture) => fixture.id === selectedFixtureId);
  const loadedFixture = FIXTURES.find((fixture) => fixture.id === loadedFixtureId);
  const inQueue = (fixtureId: string): boolean =>
    queue?.documents.some((item) => item.documentId === fixtureId) ?? false;

  const postView = posted === null ? null : buildPostView(posted);
  const busy = extracting || posting || acceptingKey !== null;

  /**
   * Fixture replay is neither a model read nor a rules read: it repeats a
   * checked-in answer, and saying otherwise in the Origin column would be the
   * one misrepresentation this pipeline cannot afford.
   */
  const extractionOrigin: 'Model' | 'Rules' | 'Replay' =
    uploadInfo === null ? 'Replay' : uploadInfo.source === 'model' ? 'Model' : 'Rules';

  const loadDocument = () => {
    if (selectedFixture === undefined) return;
    setLoadedFixtureId(selectedFixture.id);
    setText(selectedFixture.text);
    setExtraction(null);
    setPosted(null);
    setQueuedValues({});
    setFailure(null);
  };

  const extract = async () => {
    if (loadedFixture === undefined || text === '' || busy) return;

    setExtracting(true);
    setFailure(null);
    try {
      const response = await requestJson<CreateDocumentResponse>('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: loadedFixture.id,
          name: loadedFixture.file,
          text,
        }),
      });

      const rows = splitFields(response.accepted, response.queued);
      setExtraction({
        documentId: response.documentId,
        name: response.name,
        documentType: response.documentType,
        completeness: response.completeness,
        accepted: rows.accepted,
        queued: rows.queued,
        rejected: response.rejected,
      });
      setQueuedValues(
        Object.fromEntries(rows.queued.map((row) => [row.key, row.value])),
      );
      setPosted(null);
      void loadQueue();
    } catch (cause) {
      setFailure(toFailure(cause));
    } finally {
      setExtracting(false);
    }
  };

  const uploadDocument = async (file: File) => {
    if (busy || uploading) return;

    setUploading(true);
    setFailure(null);
    setUploadInfo(null);
    setExtraction(null);
    setPosted(null);

    try {
      const body = new FormData();
      body.append('file', file);

      const response = await requestJson<UploadResponse>('/api/documents/upload', {
        method: 'POST',
        body,
      });

      const rows = splitFields(response.accepted, response.queued);
      setLoadedFixtureId(null);
      setText('');
      setExtraction({
        documentId: response.documentId,
        name: response.name,
        documentType: response.documentType,
        completeness: response.completeness,
        accepted: rows.accepted,
        queued: rows.queued,
        rejected: response.rejected,
      });
      setUploadInfo(response.extraction);
      setQueuedValues(Object.fromEntries(rows.queued.map((row) => [row.key, row.value])));
      void loadQueue();
    } catch (cause) {
      setFailure(toFailure(cause));
    } finally {
      setUploading(false);
    }
  };

  const acceptField = async (row: QueuedRow) => {
    if (extraction === null || acceptingKey !== null) return;

    const value = (queuedValues[row.key] ?? row.value).trim();
    if (value === '') return;

    setAcceptingKey(row.key);
    setFailure(null);
    try {
      const response = await requestJson<AcceptFieldResponse>(
        `/api/documents/${encodeURIComponent(extraction.documentId)}/fields/${encodeURIComponent(row.key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        },
      );

      setExtraction((current) =>
        current === null
          ? current
          : {
              ...current,
              completeness: response.completeness,
              accepted: [...current.accepted, acceptedRowFromQueued(row, response.value)],
              queued: current.queued.filter((candidate) => candidate.key !== row.key),
            },
      );
      setQueuedValues((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      setPosted(null);
      void loadQueue();
    } catch (cause) {
      setFailure(toFailure(cause));
    } finally {
      setAcceptingKey(null);
    }
  };

  const postDocument = async () => {
    if (extraction === null || busy) return;

    setPosting(true);
    setFailure(null);
    try {
      const response = await requestJson<PostedDocument>(
        `/api/documents/${encodeURIComponent(extraction.documentId)}/post`,
        { method: 'POST' },
      );

      setPosted(response);
      recordPosted({
        documentId: response.documentId,
        version: response.version,
        fields: response.fields,
        postedAt: response.postedAt,
      });
      setExtraction((current) =>
        current === null
          ? current
          : {
              ...current,
              completeness: response.completeness,
            },
      );
      void loadQueue();
    } catch (cause) {
      setFailure(toFailure(cause));
    } finally {
      setPosting(false);
    }
  };

  const queuedColumns: Array<Column<QueuedRow>> = [
    {
      key: 'key',
      header: 'Field',
      width: '24%',
      render: (row) => (
        <span>
          <span style={fieldLabelStyle}>{row.label}</span>
          <span className="sal-mono" style={fieldKeyStyle}>
            {row.key}
          </span>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Why queued',
      width: '170px',
      render: (row) => (
        <span>
          <Tag tone="medium" dot>
            {row.reasonLabel}
          </Tag>
          <span style={fieldKeyStyle}>
            {formatConfidence(row.confidence)}
            {row.page === null ? '' : ` · p.${row.page}`}
          </span>
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Value to accept',
      render: (row) => (
        <input
          type="text"
          style={inputStyle}
          value={queuedValues[row.key] ?? row.value}
          placeholder={row.value === '' ? 'No extracted value' : row.value}
          aria-label={`Value for ${row.label}`}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value;
            setQueuedValues((current) => ({ ...current, [row.key]: next }));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void acceptField(row);
            }
          }}
        />
      ),
    },
    {
      key: 'accept',
      header: '',
      width: '104px',
      render: (row) => (
        <button
          type="button"
          className="sal-btn sal-btn--sm sal-btn--primary"
          disabled={busy || (queuedValues[row.key] ?? row.value).trim() === ''}
          onClick={() => void acceptField(row)}
        >
          {acceptingKey === row.key ? 'Saving…' : 'Accept'}
        </button>
      ),
    },
  ];

  return (
    <div className="sal-page">
      <PageHeader
        eyebrow="Ingestion · P5"
        title="Document inbox"
        subtitle="Upload a PDF, DOCX or text file: the server reads the text layer, extracts the labelled fields, and queues anything it cannot support. Correct what it was unsure about, then post an immutable version. Saved examples are still available as a replay."
        actions={
          <Tag tone="accent" dot title="POST /api/documents/upload parses the file; POST /api/documents replays a checked-in fixture">
            Real upload · fixture replay available
          </Tag>
        }
      />

      {failure === null ? null : <ErrorNotice failure={failure} />}

      <Card
        title="1 · Upload a document"
        subtitle="Drop a PDF, DOCX or text file, or load one of the saved examples. Either way the preview below is what the extractor actually read."
        footer="Uploads are parsed on the server (PDF and DOCX text layers). Saved examples use POST /api/documents, which replays a checked-in fixture — the response says which path ran."
        actions={
          uploadInfo === null ? (
            <Tag tone={loadedFixture === undefined ? 'neutral' : 'accent'}>
              {loadedFixture === undefined ? 'No document loaded' : loadedFixture.file}
            </Tag>
          ) : (
            <Tag
              tone={uploadInfo.source === 'model' ? 'accent' : 'medium'}
              dot
              title={
                uploadInfo.source === 'model'
                  ? 'Fields were read by the configured extraction model'
                  : 'Fields were read by the deterministic label matcher: no model was called'
              }
            >
              {uploadInfo.source === 'model' ? 'Read by model' : 'Read by rules'} ·{' '}
              {uploadInfo.kind.toUpperCase()} · {uploadInfo.pages} page
              {uploadInfo.pages === 1 ? '' : 's'}
            </Tag>
          )
        }
      >
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files.item(0);
            if (file !== null) void uploadDocument(file);
          }}
          style={{
            border: `1px dashed ${dragging ? '#6b8afd' : 'rgba(120,130,150,0.45)'}`,
            borderRadius: 10,
            padding: '16px 18px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            background: dragging ? 'rgba(107,138,253,0.06)' : 'transparent',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>Drop a file here, or choose one</div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>
              PDF, DOCX or TXT, up to 8 MB. A scanned PDF with no text layer is refused rather than
              guessed at.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.item(0) ?? null;
                event.target.value = '';
                if (file !== null) void uploadDocument(file);
              }}
            />
            <button
              type="button"
              className="sal-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || uploading}
            >
              {uploading ? 'Reading…' : 'Choose file'}
            </button>
          </div>
        </div>

        <div style={fixtureGridStyle}>
          {FIXTURES.map((fixture) => {
            const selected = fixture.id === selectedFixtureId;
            return (
              <button
                key={fixture.id}
                type="button"
                aria-pressed={selected}
                style={selected ? { ...fixtureButtonStyle, ...fixtureButtonSelectedStyle } : fixtureButtonStyle}
                onClick={() => setSelectedFixtureId(fixture.id)}
              >
                <span style={fixtureTitleStyle}>{fixture.title}</span>
                <span className="sal-mono" style={fixtureFileStyle}>
                  {fixture.file}
                </span>
                <span style={fixtureDescriptionStyle}>{fixture.description}</span>
                {inQueue(fixture.id) ? (
                  <span style={fixtureTagsStyle}>
                    <Tag tone="medium" dot>
                      In queue
                    </Tag>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div style={toolbarStyle}>
          <button
            type="button"
            className="sal-btn"
            onClick={loadDocument}
            disabled={busy || selectedFixture === undefined}
          >
            Load document
          </button>
          <button
            type="button"
            className="sal-btn sal-btn--primary"
            onClick={() => void extract()}
            disabled={loadedFixture === undefined || text === '' || busy}
          >
            {extracting ? 'Extracting…' : 'Extract fields'}
          </button>
          <span style={metaStyle}>
            {loadedFixture === undefined
              ? 'Load a fixture to enable extraction.'
              : `${loadedFixture.title} · loaded from fixtures/documents/${loadedFixture.file}`}
          </span>
        </div>

        <label htmlFor="salus-document-text" className="sal-field__label" style={previewLabelStyle}>
          Uploaded text · read only
        </label>
        <textarea
          id="salus-document-text"
          style={textareaStyle}
          value={text}
          readOnly
          spellCheck={false}
          rows={14}
          placeholder="Pick a fixture above, then choose Load document."
        />
      </Card>

      <Card
        title="2 · Review the extraction"
        subtitle={
          extraction === null
            ? 'Accepted fields clear the confidence threshold and carry a page and a quote. Everything else waits for a person.'
            : `${extraction.name} · ${formatDocumentType(extraction.documentType)}`
        }
        actions={
          extraction === null ? null : (
            <Tag tone={completenessTone(extraction.completeness)} dot>
              {completenessLabel(extraction.completeness)}
            </Tag>
          )
        }
      >
        {extraction === null ? (
          <p className="sal-empty">
            No extraction yet. Load a fixture and choose Extract fields.
          </p>
        ) : (
          <>
            <div className="sal-kpis" style={kpiGridStyle}>
              <KpiTile
                label="Completeness"
                value={extraction.completeness}
                unit="%"
                tone={extraction.completeness >= 100 ? 'good' : extraction.completeness >= 60 ? 'warn' : 'bad'}
                hint="Mandatory fields present in the working draft"
                info="Computed by the API from the document type's mandatory keys. Queued keys do not count until a reviewer accepts them."
              />
              <KpiTile
                label="Accepted"
                value={extraction.accepted.length}
                tone="good"
                hint="Cleared confidence, page and quote"
              />
              <KpiTile
                label="Awaiting review"
                value={extraction.queued.length}
                tone={extraction.queued.length > 0 ? 'warn' : 'good'}
                hint="Editable below; Accept moves a field across"
              />
              <KpiTile
                label="Rejected"
                value={extraction.rejected.length}
                hint="Unknown or duplicate captures, never candidates"
              />
            </div>

            <p style={sectionHeadingStyle}>Accepted fields</p>
            <DataTable
              columns={acceptedColumns(extractionOrigin)}
              rows={extraction.accepted}
              rowKey={(row) => row.key}
              dense
              caption="Fields accepted by the extraction, with confidence and page"
              emptyTitle="No accepted fields"
              emptyHint="Every capture is waiting on a reviewer."
            />

            <p style={sectionHeadingStyle}>Queued for review</p>
            {extraction.queued.length === 0 ? (
              <p style={emptyNoteStyle}>
                Nothing is queued. Posting now records exactly what the extraction produced.
              </p>
            ) : (
              <DataTable
                columns={queuedColumns}
                rows={extraction.queued}
                rowKey={(row) => row.key}
                dense
                caption="Fields queued for review, with reason, editable value and accept action"
                emptyTitle="Nothing queued"
                emptyHint="Every capture cleared the admission rules."
              />
            )}

            {extraction.rejected.length === 0 ? null : (
              <>
                <p style={sectionHeadingStyle}>Rejected candidates</p>
                <ul style={rejectedListStyle}>
                  {extraction.rejected.map((item, index) => (
                    <li key={`${item.key}-${index}`} style={rejectedItemStyle}>
                      <span className="sal-mono" style={rejectedKeyStyle}>
                        {item.key}
                      </span>
                      <span>{item.reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Card>

      <Card
        title="3 · Post a version"
        subtitle="Posting snapshots the working draft as an immutable version. A later correction creates the next version and leaves this one untouched."
        actions={
          <button
            type="button"
            className="sal-btn sal-btn--primary"
            onClick={() => void postDocument()}
            disabled={extraction === null || busy || posted !== null}
          >
            {posting
              ? 'Posting…'
              : posted === null
                ? 'Post document'
                : `Posted v${posted.version}`}
          </button>
        }
      >
        {postView === null || posted === null ? (
          <p style={emptyNoteStyle}>
            {extraction === null
              ? 'Extract a document first.'
              : 'Post when the draft is ready. Anything still queued is posted as unconfirmed and stays visible in the queue.'}
          </p>
        ) : (
          <>
            <p role="status" style={postHeadlineStyle}>
              {postView.headline}
            </p>
            <div style={postMetaStyle}>
              <Tag tone="low" dot>
                Version {posted.version}
              </Tag>
              <Tag tone="neutral">{formatDocumentType(posted.documentType)}</Tag>
              <span className="sal-mono" style={metaStyle}>
                {posted.documentId} · {formatTimestamp(posted.postedAt)}
              </span>
            </div>

            <p style={auditSummaryStyle}>
              <span style={auditLabelStyle}>Audit event</span>
              {posted.auditEvent.summary}
            </p>

            <p style={sectionHeadingStyle}>Before → after</p>
            <DataTable
              columns={correctionColumns}
              rows={postView.corrections}
              rowKey={(row) => row.key}
              dense
              caption="Corrections applied before this version, with the value before and after"
              emptyTitle="No field was reviewed in this version"
              emptyHint="The draft posted exactly as the extraction produced it."
            />
          </>
        )}
      </Card>

      <Card
        title="Validation queue"
        subtitle={
          queue === null
            ? 'Reading GET /api/documents…'
            : `${queue.total} ${queue.total === 1 ? 'document' : 'documents'} in this server process.`
        }
        actions={
          <button
            type="button"
            className="sal-btn sal-btn--sm"
            onClick={() => void loadQueue()}
            disabled={queueLoading}
          >
            {queueLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
        padded={false}
        footer="In-memory prototype store: restarting the API clears the queue."
      >
        <DataTable
          columns={queueColumns}
          rows={queue?.documents ?? []}
          rowKey={(item) => item.documentId}
          dense
          caption="Documents in the validation queue with status, completeness and version"
          emptyTitle={
            queueError !== null
              ? 'Queue unavailable'
              : queue === null
                ? 'Loading queue'
                : 'No documents yet'
          }
          emptyHint={
            queueError ?? 'Extract a fixture above and it appears here.'
          }
        />
      </Card>

      <p className="sal-page__foot">
        Every figure on this page is read from the API response. Completeness, confidence, version
        and the audit trail are server values; the fixture preview is the only text held in the
        browser.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ notices */

function ErrorNotice({ failure }: { failure: ApiFailure }) {
  const described = describeFailure(failure.status, failure.message);

  return (
    <div role="alert" style={noticeStyle}>
      <span style={noticeTitleStyle}>{described.title}</span>
      {described.detail === undefined ? null : (
        <span style={noticeDetailStyle}>{described.detail}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- styles */

const fixtureGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
  gap: 'var(--space-sm)',
};

const fixtureButtonStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '3px',
  padding: '10px 12px',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--paper)',
  color: 'var(--ink)',
  textAlign: 'left',
  cursor: 'pointer',
};

const fixtureButtonSelectedStyle: CSSProperties = {
  borderColor: 'var(--crimson)',
  background: 'var(--card)',
  boxShadow: 'inset 0 0 0 1px var(--crimson)',
};

const fixtureTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  lineHeight: 'var(--leading-snug)',
};

const fixtureFileStyle: CSSProperties = {
  fontSize: 'var(--text-micro)',
  letterSpacing: '.04em',
  color: 'var(--crimson-deep)',
};

const fixtureDescriptionStyle: CSSProperties = {
  marginTop: '2px',
  fontSize: 'var(--text-xs)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--muted)',
};

const fixtureTagsStyle: CSSProperties = {
  marginTop: 'var(--space-xs)',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 'var(--space-sm)',
  marginTop: 'var(--space-xl)',
};

const previewLabelStyle: CSSProperties = {
  display: 'block',
  marginTop: 'var(--space-lg)',
  marginBottom: 'var(--space-xxs)',
};

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: '220px',
  padding: 'var(--space-lg)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--paper)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  lineHeight: 'var(--leading-relaxed)',
  resize: 'vertical',
  whiteSpace: 'pre-wrap',
};

const kpiGridStyle: CSSProperties = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
};

const sectionHeadingStyle: CSSProperties = {
  margin: 'var(--space-xxl) 0 var(--space-sm)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-bold)',
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--dusk-dim)',
};

const emptyNoteStyle: CSSProperties = {
  margin: 'var(--space-sm) 0',
  padding: 'var(--space-lg)',
  border: '1px dashed var(--line)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--paper)',
  fontSize: 'var(--text-body-sm)',
  color: 'var(--muted)',
};

const fieldLabelStyle: CSSProperties = {
  display: 'block',
  fontWeight: 'var(--weight-semibold)',
  lineHeight: 'var(--leading-snug)',
};

const fieldKeyStyle: CSSProperties = {
  display: 'block',
  marginTop: '1px',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.04em',
  color: 'var(--muted)',
};

const valueStyle: CSSProperties = {
  fontWeight: 'var(--weight-medium)',
};

const monoCellStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.03em',
  color: 'var(--muted)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  minWidth: '170px',
  padding: '5px 8px',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontSize: 'var(--text-body-sm)',
};

const rejectedListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-xxs)',
};

const rejectedItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--space-sm)',
  padding: '5px 8px',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--paper)',
  fontSize: 'var(--text-xs)',
  color: 'var(--muted)',
};

const rejectedKeyStyle: CSSProperties = {
  flex: 'none',
  color: 'var(--crimson-deep)',
};

const postHeadlineStyle: CSSProperties = {
  margin: '0 0 var(--space-md)',
  fontFamily: 'var(--font-serif)',
  fontSize: 'var(--text-h2)',
  fontWeight: 'var(--weight-semibold)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink)',
};

const postMetaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 'var(--space-sm)',
};

const auditSummaryStyle: CSSProperties = {
  marginTop: 'var(--space-lg)',
  padding: 'var(--space-sm) var(--space-lg)',
  borderLeft: '3px solid var(--crimson)',
  background: 'var(--paper)',
  fontSize: 'var(--text-body-sm)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink)',
};

const auditLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '1px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: 'var(--crimson-deep)',
};

const beforeStyle: CSSProperties = {
  color: 'var(--muted)',
  textDecoration: 'line-through',
};

const unchangedBeforeStyle: CSSProperties = {
  color: 'var(--muted)',
};

const afterStyle: CSSProperties = {
  color: 'var(--ink)',
  fontWeight: 'var(--weight-semibold)',
};

const noticeStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: 'var(--space-md) var(--space-lg)',
  border: '1px solid var(--band-critical)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--band-critical-bg)',
  color: 'var(--band-critical-text)',
  fontSize: 'var(--text-body-sm)',
};

const noticeTitleStyle: CSSProperties = {
  fontWeight: 'var(--weight-bold)',
};

const noticeDetailStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  lineHeight: 'var(--leading-snug)',
};
