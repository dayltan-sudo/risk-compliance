import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { fixtureExtractionClient } from '../src/ingestion/fixtureClient';
import { ValidationQueue } from '../src/ingestion/queue';
import { BODY_LIMITS } from '../server/middleware/body';
import { createAssistantRoutes } from '../server/routes/assistant';
import {
  createDocumentRoutes,
  DOCUMENT_NAME_MAX_CHARS,
  DOCUMENT_TEXT_MAX_CHARS,
} from '../server/routes/documents';
import { sessionRoutes } from '../server/routes/session';

/**
 * Item 4: body limits. An oversized body is a 413 JSON response, refused from
 * its length before it is parsed. An oversized field is a 400 with the zod
 * issue. The limits sit exactly at the field caps, with room for escaping.
 */

const FIVE_MB = 5 * 1024 * 1024;

function documentsApp(): Hono {
  const app = new Hono();
  app.route('/', createDocumentRoutes({ client: fixtureExtractionClient(), queue: new ValidationQueue() }));
  return app;
}

async function jsonPost(app: Hono, path: string, body: string): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

/** Every character as a six-byte \uXXXX escape: the largest legal encoding. */
function fullyEscaped(text: string): string {
  return [...text].map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
}

describe('oversized bodies are refused with 413 JSON', () => {
  it('refuses a 5 MB document body and creates nothing', async () => {
    const app = documentsApp();
    const response = await jsonPost(
      app,
      '/api/documents',
      JSON.stringify({ name: 'big', text: 'a'.repeat(FIVE_MB) }),
    );

    expect(response.status).toBe(413);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ limitBytes: BODY_LIMITS.documentCreate });

    const list = await app.request('/api/documents');
    expect(await list.json()).toMatchObject({ total: 0 });
  });

  it('refuses a 5 MB body that arrives without a Content-Length, while it streams', async () => {
    const app = documentsApp();
    const chunk = new TextEncoder().encode('a'.repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= FIVE_MB) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
        sent += chunk.byteLength;
      },
    });

    const request = new Request('http://salus.test/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const response = await app.request(request);

    expect(response.status).toBe(413);
    // The reader stopped once the limit was crossed, not after the full 5 MB.
    expect(sent).toBeLessThan(BODY_LIMITS.documentCreate + 2 * chunk.byteLength);
  });

  it('refuses a 5 MB assistant body before it is parsed', async () => {
    const app = createAssistantRoutes({ model: null });
    const response = await jsonPost(
      app,
      '/api/assistant',
      JSON.stringify({ question: 'q'.repeat(FIVE_MB) }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ limitBytes: BODY_LIMITS.assistantAsk });
  });

  it('refuses a 5 MB field value and a 5 MB role switch', async () => {
    const app = documentsApp();
    expect(
      (
        await jsonPost(
          app,
          '/api/documents',
          JSON.stringify({ id: 'slip-cyber-2', name: 'Cyber slip', text: 'x' }),
        )
      ).status,
    ).toBe(201);

    const field = await jsonPost(
      app,
      '/api/documents/slip-cyber-2/fields/sum_insured',
      JSON.stringify({ value: 'v'.repeat(FIVE_MB) }),
    );
    expect(field.status).toBe(413);

    const session = new Hono();
    session.route('/', sessionRoutes);
    const role = await jsonPost(session, '/api/session/role', JSON.stringify({ role: 'x'.repeat(FIVE_MB) }));
    expect(role.status).toBe(413);
  });
});

describe('oversized fields are refused with 400', () => {
  it('rejects a document text one character over the limit, with the zod issue', async () => {
    const response = await jsonPost(
      documentsApp(),
      '/api/documents',
      JSON.stringify({ name: 'Cyber slip', text: 'a'.repeat(DOCUMENT_TEXT_MAX_CHARS + 1) }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { issues: Array<{ path: unknown[]; message: string }> };
    expect(body.issues).toEqual([
      expect.objectContaining({ path: ['text'], message: expect.stringContaining('text is too long') }),
    ]);
  });

  it('rejects a document name one character over the limit, and accepts one at it', async () => {
    const app = documentsApp();
    const tooLong = await jsonPost(
      app,
      '/api/documents',
      JSON.stringify({ name: 'n'.repeat(DOCUMENT_NAME_MAX_CHARS + 1), text: 'x' }),
    );
    expect(tooLong.status).toBe(400);
    expect(JSON.stringify(await tooLong.json())).toContain('name is too long');

    const atLimit = await jsonPost(
      app,
      '/api/documents',
      JSON.stringify({ id: 'slip-cyber-2', name: 'n'.repeat(DOCUMENT_NAME_MAX_CHARS), text: 'x' }),
    );
    expect(atLimit.status).toBe(201);
  });

  it('accepts a document text at the limit even when every character is escaped', async () => {
    const text = 'A'.repeat(DOCUMENT_TEXT_MAX_CHARS);
    const body = `{"id":"slip-cyber-2","name":"Cyber slip","text":"${fullyEscaped(text)}"}`;
    expect(body.length).toBeLessThan(BODY_LIMITS.documentCreate);

    const response = await jsonPost(documentsApp(), '/api/documents', body);
    expect(response.status).toBe(201);
  });

  it('rejects an assistant question one character over 2,000, and accepts 2,000', async () => {
    const app = createAssistantRoutes({ model: null });

    const tooLong = await jsonPost(app, '/api/assistant', JSON.stringify({ question: 'q'.repeat(2001) }));
    expect(tooLong.status).toBe(400);
    expect(JSON.stringify(await tooLong.json())).toContain('question is too long');

    // Past validation the route reports the unconfigured model, which is a 503.
    const atLimit = await jsonPost(app, '/api/assistant', JSON.stringify({ question: 'q'.repeat(2000) }));
    expect(atLimit.status).toBe(503);
  });

  it('rejects a field value over 20,000 characters', async () => {
    const app = documentsApp();
    await jsonPost(
      app,
      '/api/documents',
      JSON.stringify({ id: 'slip-cyber-2', name: 'Cyber slip', text: 'x' }),
    );

    const response = await jsonPost(
      app,
      '/api/documents/slip-cyber-2/fields/sum_insured',
      JSON.stringify({ value: 'v'.repeat(20_001) }),
    );
    expect(response.status).toBe(400);
  });

  it('keeps a malformed JSON body at 400, not 413', async () => {
    const response = await jsonPost(documentsApp(), '/api/documents', '{');
    expect(response.status).toBe(400);
  });
});
