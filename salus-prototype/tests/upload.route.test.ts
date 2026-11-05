import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { createUploadRoutes } from '../server/routes/upload';
import { ValidationQueue } from '../src/ingestion/queue';

/**
 * The upload endpoint, exercised with the same multipart body a browser sends.
 * The fixtures are real PDF/DOCX/TXT files, so this covers parsing and routing
 * together rather than mocking the parser.
 */

const PDF = readFileSync('fixtures/uploads/hai-phong-renewal-2026.pdf');
const DOCX = readFileSync('fixtures/uploads/hai-phong-renewal-2026.docx');
const TXT = readFileSync('fixtures/uploads/hai-phong-renewal-2026.txt');

function app(): ReturnType<typeof createUploadRoutes> {
  return createUploadRoutes({ queue: new ValidationQueue(), resolveClient: () => undefined });
}

function upload(
  instance: ReturnType<typeof createUploadRoutes>,
  bytes: Uint8Array,
  name: string,
  fields: Record<string, string> = {},
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  // `slice()` gives a view with its own exact-length buffer: a Node Buffer's
  // `.buffer` spans the whole pool, which would upload padding.
  const copy = bytes.slice();
  body.append('file', new Blob([copy as unknown as BlobPart]), name);
  return instance.request('/api/documents/upload', { method: 'POST', body });
}

interface UploadBody {
  status?: string;
  documentId?: string;
  completeness?: number;
  accepted?: unknown[];
  queued?: unknown[];
  extraction?: { source: string; kind: string; pages: number; documentType: string };
  draft?: Record<string, string>;
  error?: string;
}

describe('POST /api/documents/upload', () => {
  it('parses a PDF and reports the rules extractor', async () => {
    const response = await upload(app(), PDF, 'hai-phong-renewal-2026.pdf');
    expect(response.status).toBe(201);

    const body = (await response.json()) as UploadBody;
    expect(body.extraction).toMatchObject({ source: 'rules', kind: 'pdf', documentType: 'renewal' });
    expect(body.draft?.['policy_no']).toBe('PRP-2026-0008');
    expect(body.draft?.['sum_insured']).toBe('SGD 80,000,000');
    expect(body.completeness).toBe(100);
  });

  it('parses a DOCX', async () => {
    const response = await upload(app(), DOCX, 'slip.docx');
    expect(response.status).toBe(201);
    const body = (await response.json()) as UploadBody;
    expect(body.extraction).toMatchObject({ kind: 'docx' });
    expect(body.draft?.['policy_no']).toBe('PRP-2026-0008');
  });

  it('parses a text file', async () => {
    const response = await upload(app(), TXT, 'slip.txt');
    expect(response.status).toBe(201);
    const body = (await response.json()) as UploadBody;
    expect(body.extraction).toMatchObject({ kind: 'txt' });
  });

  it('accepts a caller-supplied document id and rejects a duplicate', async () => {
    const instance = app();
    const first = await upload(instance, PDF, 'a.pdf', { documentId: 'fixed-id' });
    expect(first.status).toBe(201);

    const second = await upload(instance, PDF, 'b.pdf', { documentId: 'fixed-id' });
    expect(second.status).toBe(409);
  });

  it('rejects an unsupported file type', async () => {
    const response = await upload(app(), new Uint8Array([0x00, 0x01, 0x02]), 'scan.raw');
    expect(response.status).toBe(400);
    expect(((await response.json()) as UploadBody).error).toBe('unsupported_type');
  });

  it('rejects a request with no file field', async () => {
    const body = new FormData();
    body.append('documentId', 'no-file');
    const response = await app().request('/api/documents/upload', { method: 'POST', body });
    expect(response.status).toBe(400);
  });

  it('rejects a file over the size limit before parsing it', async () => {
    const huge = new Uint8Array(8 * 1024 * 1024 + 16);
    huge.set([0x25, 0x50, 0x44, 0x46]);
    const response = await upload(app(), huge, 'huge.pdf');
    expect(response.status).toBe(413);
  });
});
