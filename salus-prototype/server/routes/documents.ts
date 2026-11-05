import { Hono } from 'hono';
import { z } from 'zod';

import { openAiExtractionClient, type ExtractionClient } from '../../src/ingestion/client';
import { extractDocument } from '../../src/ingestion/extract';
import { QueueError, ValidationQueue, type QueueErrorCode } from '../../src/ingestion/queue';
import { canonicalFieldKeySchema, documentTypeSchema } from '../../src/ingestion/schema';

/**
 * P5 document routes.
 *
 * Mount this sub-app at the root: it owns the full `/api/documents` prefix. The
 * orchestrator does `app.route('/', documentRoutes)`; no other route file needs
 * to know about the queue.
 *
 * State is module-local and seeded empty, per the prototype brief. A restart
 * clears the queue.
 */

export interface DocumentRoutesOptions {
  /** Injected extraction client, used by tests and the fixture demo. */
  client?: ExtractionClient;
  /** Real client config. Constructs an OpenAI-compatible client only when passed. */
  extraction?: { baseUrl: string; apiKey: string; model: string };
  /** Injected queue, used by tests. Defaults to a fresh in-memory queue. */
  queue?: ValidationQueue;
}

let configuredClient: ExtractionClient | undefined;

/**
 * Configure the client used by the default `documentRoutes` instance.
 *
 * Kept separate from route construction so the orchestrator can mount the
 * sub-app before deciding whether this instance talks to a model or to a
 * fixture. Passing `undefined` clears it.
 */
export function configureDocumentRoutes(client: ExtractionClient | undefined): void {
  configuredClient = client;
}

function randomDocumentId(): string {
  return `doc-${crypto.randomUUID()}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function queueFailure(
  error: unknown,
): { status: 400 | 404 | 409; body: { error: string; code: QueueErrorCode } } | undefined {
  if (!(error instanceof QueueError)) return undefined;
  const status = error.code === 'document_not_found' ? 404 : error.code === 'duplicate_document' ? 409 : 400;
  return { status, body: { error: error.message, code: error.code } };
}

const createDocumentSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  text: z.string().min(1, 'text is required'),
  /** Optional caller-supplied id, useful for deterministic demos and tests. */
  id: z.string().trim().min(1).max(120).optional(),
  documentTypeHint: documentTypeSchema.optional(),
});

const fieldValueSchema = z.object({
  value: z.string().trim().min(1, 'value must not be empty').max(20_000),
});

export function createDocumentRoutes(options: DocumentRoutesOptions = {}): Hono {
  if (options.client !== undefined && options.extraction !== undefined) {
    throw new Error('createDocumentRoutes: pass either client or extraction config, not both');
  }

  const queue = options.queue ?? new ValidationQueue();
  const explicitClient =
    options.client ?? (options.extraction === undefined ? undefined : openAiExtractionClient(options.extraction));
  const resolveClient = (): ExtractionClient | undefined => explicitClient ?? configuredClient;

  const app = new Hono();

  app.get('/api/documents', (c) => {
    const documents = queue.list();
    return c.json({ documents, total: documents.length });
  });

  app.post('/api/documents', async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = createDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid request body; expected { name, text }', issues: parsed.error.issues }, 400);
    }

    const client = resolveClient();
    if (client === undefined) {
      return c.json(
        {
          error:
            'extraction client is not configured; call configureDocumentRoutes() or createDocumentRoutes({ client })',
        },
        503,
      );
    }

    const documentId = parsed.data.id ?? randomDocumentId();

    let extracted;
    try {
      extracted = await extractDocument(parsed.data.text, client, {
        documentId,
        ...(parsed.data.documentTypeHint === undefined
          ? {}
          : { documentTypeHint: parsed.data.documentTypeHint }),
      });
    } catch (error) {
      return c.json({ error: 'extraction failed', detail: messageOf(error) }, 502);
    }

    try {
      const item = queue.enqueue({
        documentId,
        name: parsed.data.name,
        normalised: extracted.normalised,
      });

      return c.json(
        {
          ...item,
          draft: extracted.draft,
          accepted: extracted.normalised.accepted,
          queued: extracted.normalised.queued,
          rejected: extracted.normalised.rejected,
        },
        201,
      );
    } catch (error) {
      const failure = queueFailure(error);
      if (failure !== undefined) return c.json(failure.body, failure.status);
      throw error;
    }
  });

  app.post('/api/documents/:id/fields/:key', async (c) => {
    const key = canonicalFieldKeySchema.safeParse(c.req.param('key'));
    if (!key.success) {
      return c.json(
        {
          error: `unknown canonical field "${c.req.param('key')}"`,
          code: 'unknown_field' as const,
        },
        400,
      );
    }

    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = fieldValueSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: 'invalid request body; expected { value: string }', issues: parsed.error.issues },
        400,
      );
    }

    try {
      return c.json(queue.accept(c.req.param('id'), key.data, parsed.data.value));
    } catch (error) {
      const failure = queueFailure(error);
      if (failure !== undefined) return c.json(failure.body, failure.status);
      throw error;
    }
  });

  app.post('/api/documents/:id/post', (c) => {
    try {
      return c.json(queue.post(c.req.param('id')));
    } catch (error) {
      const failure = queueFailure(error);
      if (failure !== undefined) return c.json(failure.body, failure.status);
      throw error;
    }
  });

  return app;
}

/** Sub-app for the orchestrator to mount. Starts empty and unconfigured. */
export const documentRoutes = createDocumentRoutes();
