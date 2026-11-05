import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openAiExtractionClient } from '../src/ingestion/client';
import { buildExtractionPrompt, extractDocument, type ExtractionResult } from '../src/ingestion/extract';
import { fixtureExtractionClient } from '../src/ingestion/fixtureClient';
import { QueueError, ValidationQueue, type AuditEvent } from '../src/ingestion/queue';
import {
  CANONICAL_FIELD_KEYS,
  DOCUMENT_TYPES,
  rawExtractionSchema,
  type RawExtraction,
} from '../src/ingestion/schema';
import { DEFAULT_CONFIDENCE_THRESHOLD } from '../src/ingestion/validate';
import { createDocumentRoutes } from '../server/routes/documents';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');

const FIXTURE_ID = 'slip-cyber-2';
const FIXTURE_TEXT = readFileSync(join(REPO_ROOT, 'fixtures', 'documents', `${FIXTURE_ID}.txt`), 'utf8');
const EXPECTED_RAW: RawExtraction = rawExtractionSchema.parse(
  JSON.parse(readFileSync(join(REPO_ROOT, 'fixtures', 'expected', `${FIXTURE_ID}.json`), 'utf8')),
);

const EXTRACTED_SUM_INSURED = 'SGD 12,000,000';
const CORRECTED_SUM_INSURED = 'SGD 15,500,000';
const SECOND_CORRECTION = 'SGD 16,000,000';

interface CreateDocumentResponse {
  documentId: string;
  name: string;
  status: string;
  documentType: string;
  completeness: number;
  unconfirmed: string[];
  version: number;
  draft: {
    documentId: string;
    documentType: string;
    unconfirmed: string[];
    sum_insured?: string;
  };
  accepted: { key: string; value: string }[];
  queued: { key: string; reason: string; value: string }[];
  rejected: unknown[];
}

interface ListResponse {
  total: number;
  documents: {
    documentId: string;
    status: string;
    completeness: number;
    version: number;
    unconfirmed: string[];
  }[];
}

interface FieldResponse {
  documentId: string;
  field: string;
  value: string;
  completeness: number;
  unconfirmed: string[];
  auditEvent: AuditEvent;
}

interface PostedResponse {
  documentId: string;
  documentType: string;
  version: number;
  fields: Record<string, string | undefined>;
  unconfirmed: string[];
  completeness: number;
  auditEvent: AuditEvent;
  auditTrail: AuditEvent[];
}

async function extractFixture(): Promise<ExtractionResult> {
  return extractDocument(FIXTURE_TEXT, fixtureExtractionClient(), { documentId: FIXTURE_ID });
}

function enqueueFixture(queue: ValidationQueue, result: ExtractionResult) {
  return queue.enqueue({
    documentId: FIXTURE_ID,
    name: 'Cyber slip',
    normalised: result.normalised,
  });
}

function captureQueueError(fn: () => unknown): QueueError {
  try {
    fn();
  } catch (error) {
    if (error instanceof QueueError) return error;
    throw error;
  }
  throw new Error('expected a QueueError');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildExtractionPrompt', () => {
  const prompt = buildExtractionPrompt('Policy number: KUA-CY-26-01194');

  it('contains every canonical field key', () => {
    for (const key of CANONICAL_FIELD_KEYS) {
      expect(prompt, `prompt is missing ${key}`).toContain(key);
    }
  });

  it('contains every document type', () => {
    for (const type of DOCUMENT_TYPES) {
      expect(prompt, `prompt is missing ${type}`).toContain(type);
    }
  });

  it('demands a confidence, a page, a verbatim quote, and omission instead of guessing', () => {
    expect(prompt).toMatch(/confidence/i);
    expect(prompt).toMatch(/number from 0 to 1/i);
    expect(prompt).toMatch(/page/i);
    expect(prompt).toMatch(/1-based page/i);
    expect(prompt).toMatch(/verbatim/i);
    expect(prompt).toMatch(/quote/i);
    expect(prompt).toMatch(/omit/i);
    expect(prompt).toMatch(/never guess/i);
  });

  it('embeds the document text inside the data boundary', () => {
    expect(prompt).toContain('<document>');
    expect(prompt).toMatch(/Policy number:\s+KUA-CY-26-01194/);
    expect(prompt).toContain('</document>');
  });
});

describe('fixtureExtractionClient', () => {
  it('replays the expected extraction for a known document id', async () => {
    const client = fixtureExtractionClient();
    await expect(client.extract({ documentId: FIXTURE_ID, text: FIXTURE_TEXT })).resolves.toEqual(EXPECTED_RAW);
  });

  it('throws instead of falling back when the document is unknown', async () => {
    const client = fixtureExtractionClient();
    await expect(client.extract({ documentId: 'no-such-document', text: FIXTURE_TEXT })).rejects.toThrow(
      /no fixture for document "no-such-document"/i,
    );
  });

  it('throws at construction when the configured directory has no fixtures', () => {
    expect(() => fixtureExtractionClient({ expectedDir: join(REPO_ROOT, 'fixtures', 'documents') })).toThrow(
      /no .json fixtures/i,
    );
    expect(() => fixtureExtractionClient({ expectedDir: join(REPO_ROOT, 'fixtures', 'does-not-exist') })).toThrow(
      /not found/i,
    );
  });

  it('returns a copy so a caller cannot poison the cache', async () => {
    const client = fixtureExtractionClient();
    const first = (await client.extract({ documentId: FIXTURE_ID, text: FIXTURE_TEXT })) as RawExtraction;
    first.fields.length = 0;

    await expect(client.extract({ documentId: FIXTURE_ID, text: FIXTURE_TEXT })).resolves.toEqual(EXPECTED_RAW);
  });
});

describe('extractDocument over a fixture', () => {
  it('returns the raw extraction, routing, draft and completeness', async () => {
    const result = await extractFixture();

    expect(result.raw).toEqual(EXPECTED_RAW);
    expect(result.normalised.documentType).toBe('slip');
    expect(result.draft.documentId).toBe(FIXTURE_ID);
    expect(result.draft.documentType).toBe('slip');
    expect(result.completeness).toBe(78);
  });

  it('queues exactly three below-threshold captures plus the missing mandatory key', async () => {
    const { normalised, draft } = await extractFixture();

    const belowThreshold = normalised.queued.filter(
      (field) => field.reason === 'low_confidence',
    );
    expect(belowThreshold.map((field) => field.key)).toEqual([
      'sum_insured',
      'limit_aggregate',
      'key_exclusions',
    ]);
    expect(belowThreshold.every((field) => field.reason === 'low_confidence')).toBe(true);

    expect(normalised.queued.find((field) => field.key === 'premium_gross')?.reason).toBe(
      'missing_mandatory',
    );
    expect(normalised.queued).toHaveLength(4);

    expect(draft.sum_insured).toBeUndefined();
    expect(draft.limit_aggregate).toBeUndefined();
    expect(draft.key_exclusions).toBeUndefined();
    expect(draft.premium_gross).toBeUndefined();
    expect(draft.unconfirmed).toEqual(
      expect.arrayContaining(['sum_insured', 'limit_aggregate', 'key_exclusions', 'premium_gross']),
    );
  });

  it('passes a custom confidence threshold through to the draft', async () => {
    const result = await extractDocument(FIXTURE_TEXT, fixtureExtractionClient(), {
      documentId: FIXTURE_ID,
      threshold: 0.5,
    });

    expect(result.draft.sum_insured).toBe(EXTRACTED_SUM_INSURED);
    expect(result.normalised.queued.map((field) => field.key)).toEqual(['premium_gross']);
    expect(result.completeness).toBe(89);
  });
});

describe('validation queue', () => {
  it('posts the reviewer correction, not the extracted value, and records both', async () => {
    const result = await extractFixture();
    const queue = new ValidationQueue();

    const item = enqueueFixture(queue, result);
    expect(item).toMatchObject({
      documentId: FIXTURE_ID,
      status: 'queued',
      completeness: 78,
      version: 0,
    });

    const accepted = queue.accept(FIXTURE_ID, 'sum_insured', CORRECTED_SUM_INSURED);
    expect(accepted.completeness).toBe(89);
    expect(accepted.unconfirmed).not.toContain('sum_insured');
    expect(accepted.auditEvent).toMatchObject({
      action: 'field_accepted',
      field: 'sum_insured',
      extractedValue: EXTRACTED_SUM_INSURED,
      acceptedValue: CORRECTED_SUM_INSURED,
      reason: 'low_confidence',
      version: 1,
    });

    const posted = queue.post(FIXTURE_ID);
    expect(posted.version).toBe(1);
    expect(posted.fields.sum_insured).toBe(CORRECTED_SUM_INSURED);
    expect(posted.fields.sum_insured).not.toBe(EXTRACTED_SUM_INSURED);
    expect(posted.completeness).toBe(89);
    expect(posted.auditEvent.action).toBe('document_posted');

    const recorded = posted.auditTrail.find((event) => event.action === 'field_accepted');
    expect(recorded).toMatchObject({
      field: 'sum_insured',
      extractedValue: EXTRACTED_SUM_INSURED,
      acceptedValue: CORRECTED_SUM_INSURED,
    });

    expect(queue.get(FIXTURE_ID)).toMatchObject({
      status: 'posted',
      version: 1,
      completeness: 89,
    });
  });

  it('appends a new version instead of mutating a posted draft', async () => {
    const result = await extractFixture();
    const queue = new ValidationQueue();
    enqueueFixture(queue, result);

    queue.accept(FIXTURE_ID, 'sum_insured', CORRECTED_SUM_INSURED);
    const first = queue.post(FIXTURE_ID);

    queue.accept(FIXTURE_ID, 'sum_insured', SECOND_CORRECTION);
    const second = queue.post(FIXTURE_ID);

    expect(first.version).toBe(1);
    expect(first.fields.sum_insured).toBe(CORRECTED_SUM_INSURED);
    expect(first.auditTrail).toHaveLength(3);

    expect(second.version).toBe(2);
    expect(second.fields.sum_insured).toBe(SECOND_CORRECTION);
    expect(second.auditTrail).toHaveLength(5);
    expect(second.auditTrail.at(-2)?.extractedValue).toBe(EXTRACTED_SUM_INSURED);
    expect(second.auditTrail.at(-2)?.acceptedValue).toBe(SECOND_CORRECTION);
  });

  it('rejects unknown documents, unknown keys, empty values and duplicate ids', async () => {
    const result = await extractFixture();
    const queue = new ValidationQueue();
    enqueueFixture(queue, result);

    expect(captureQueueError(() => queue.post('missing')).code).toBe('document_not_found');
    expect(captureQueueError(() => queue.accept('missing', 'sum_insured', 'x')).code).toBe(
      'document_not_found',
    );
    expect(captureQueueError(() => queue.accept(FIXTURE_ID, 'policy_number', 'x')).code).toBe(
      'unknown_field',
    );
    expect(captureQueueError(() => queue.accept(FIXTURE_ID, 'sum_insured', '   ')).code).toBe(
      'empty_value',
    );
    expect(captureQueueError(() => enqueueFixture(queue, result)).code).toBe('duplicate_document');
  });
});

describe('documentRoutes', () => {
  function routes() {
    return createDocumentRoutes({ client: fixtureExtractionClient(), queue: new ValidationQueue() });
  }

  it('runs ingest, accept and post over HTTP', async () => {
    const app = routes();

    const createResponse = await app.request('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: FIXTURE_ID, name: 'Cyber slip', text: FIXTURE_TEXT }),
    });
    expect(createResponse.status).toBe(201);

    const created = (await createResponse.json()) as CreateDocumentResponse;
    expect(created).toMatchObject({
      documentId: FIXTURE_ID,
      name: 'Cyber slip',
      status: 'queued',
      documentType: 'slip',
      completeness: 78,
      version: 0,
    });
    expect(created.accepted).toHaveLength(10);
    expect(created.queued).toHaveLength(4);
    expect(created.rejected).toEqual([]);
    expect(created.draft.sum_insured).toBeUndefined();
    expect(created.draft.unconfirmed).toContain('sum_insured');

    const listResponse = await app.request('/api/documents');
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as ListResponse;
    expect(listed.total).toBe(1);
    expect(listed.documents[0]).toMatchObject({
      documentId: FIXTURE_ID,
      status: 'queued',
      completeness: 78,
      version: 0,
    });

    const fieldResponse = await app.request(`/api/documents/${FIXTURE_ID}/fields/sum_insured`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: CORRECTED_SUM_INSURED }),
    });
    expect(fieldResponse.status).toBe(200);
    const field = (await fieldResponse.json()) as FieldResponse;
    expect(field).toMatchObject({
      documentId: FIXTURE_ID,
      field: 'sum_insured',
      value: CORRECTED_SUM_INSURED,
      completeness: 89,
    });
    expect(field.auditEvent).toMatchObject({
      action: 'field_accepted',
      extractedValue: EXTRACTED_SUM_INSURED,
      acceptedValue: CORRECTED_SUM_INSURED,
    });

    const postResponse = await app.request(`/api/documents/${FIXTURE_ID}/post`, { method: 'POST' });
    expect(postResponse.status).toBe(200);
    const posted = (await postResponse.json()) as PostedResponse;
    expect(posted.version).toBe(1);
    expect(posted.fields.sum_insured).toBe(CORRECTED_SUM_INSURED);
    expect(posted.fields.sum_insured).not.toBe(EXTRACTED_SUM_INSURED);
    expect(posted.completeness).toBe(89);
    expect(posted.auditEvent.action).toBe('document_posted');
    expect(posted.auditTrail.find((event) => event.action === 'field_accepted')).toMatchObject({
      extractedValue: EXTRACTED_SUM_INSURED,
      acceptedValue: CORRECTED_SUM_INSURED,
    });

    const afterResponse = await app.request('/api/documents');
    const after = (await afterResponse.json()) as ListResponse;
    expect(after.documents[0]).toMatchObject({ status: 'posted', version: 1, completeness: 89 });
  });

  it('returns 400 for a malformed create body or an unknown field key', async () => {
    const app = routes();

    const badCreate = await app.request('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', text: '' }),
    });
    expect(badCreate.status).toBe(400);

    const malformedJson = await app.request('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformedJson.status).toBe(400);

    const badKey = await app.request(`/api/documents/${FIXTURE_ID}/fields/policy_number`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x' }),
    });
    expect(badKey.status).toBe(400);
    expect(await badKey.json()).toMatchObject({ code: 'unknown_field' });
  });

  it('returns 404 for an unknown document and 409 for a duplicate id', async () => {
    const app = routes();

    const missing = await app.request('/api/documents/missing/fields/sum_insured', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'SGD 1' }),
    });
    expect(missing.status).toBe(404);

    const body = JSON.stringify({ id: FIXTURE_ID, name: 'Cyber slip', text: FIXTURE_TEXT });
    const headers = { 'content-type': 'application/json' };
    expect((await app.request('/api/documents', { method: 'POST', headers, body })).status).toBe(201);
    expect((await app.request('/api/documents', { method: 'POST', headers, body })).status).toBe(409);
  });

  it('refuses to ingest when no extraction client is configured', async () => {
    const app = createDocumentRoutes({ queue: new ValidationQueue() });
    const response = await app.request('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cyber slip', text: FIXTURE_TEXT }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/not configured/i) });
  });
});

describe('openAiExtractionClient', () => {
  it('posts the prompt to an OpenAI-compatible endpoint and validates the returned JSON', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(EXPECTED_RAW) } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = openAiExtractionClient({
      baseUrl: 'https://llm.example.test/v1/',
      apiKey: 'test-key',
      model: 'test-model',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      client.extract({
        documentId: FIXTURE_ID,
        text: FIXTURE_TEXT,
        documentTypeHint: 'slip',
      }),
    ).resolves.toEqual(EXPECTED_RAW);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error('fetch was not called');
    const [url, init] = call;

    expect(String(url)).toBe('https://llm.example.test/v1/chat/completions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key');

    const body = JSON.parse(String(init?.body)) as {
      model: string;
      response_format: { type: string };
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe('test-model');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.content).toMatch(/Policy number:\s+KUA-CY-26-01194/);
    expect(body.messages[0]?.content).toContain('Document type hint');
  });

  it('throws a clear error when the model content is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), {
            status: 200,
          }),
      ),
    );

    const client = openAiExtractionClient({
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'test-key',
      model: 'test-model',
    });

    await expect(client.extract({ documentId: 'x', text: 'x' })).rejects.toThrow(/not valid JSON/i);
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream unavailable', { status: 503 })),
    );

    const client = openAiExtractionClient({
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'test-key',
      model: 'test-model',
    });

    await expect(client.extract({ documentId: 'x', text: 'x' })).rejects.toThrow(/HTTP 503/);
  });

  it('throws when the returned JSON does not match the extraction schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify({ documentType: 'slip', fields: [{ key: 'x' }] }) } }],
            }),
            { status: 200 },
          ),
      ),
    );

    const client = openAiExtractionClient({
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'test-key',
      model: 'test-model',
    });

    await expect(client.extract({ documentId: 'x', text: 'x' })).rejects.toThrow(/extraction schema/i);
  });
});
