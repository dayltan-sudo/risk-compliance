import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Session } from '../../src/audit/types';
import { portfolio } from '../../src/data/portfolio';
import { openAiExtractionClient, type ExtractionClient } from '../../src/ingestion/client';
import { extractDocument } from '../../src/ingestion/extract';
import {
  QueueError,
  ValidationQueue,
  type QueueErrorCode,
  type QueueItemSummary,
} from '../../src/ingestion/queue';
import { canonicalFieldKeySchema, documentTypeSchema } from '../../src/ingestion/schema';
import { recordScopedAudit } from '../middleware/audit-scope';
import { BODY_LIMITS, bodyTooLarge, readJsonBody } from '../middleware/body';
import { isInScope, scopeFor } from '../middleware/scope';
import { readSession } from './session';

/**
 * P5 document routes.
 *
 * Mount this sub-app at the root: it owns the full `/api/documents` prefix. The
 * orchestrator does `app.route('/', documentRoutes)`; no other route file needs
 * to know about the queue.
 *
 * State is module-local and seeded empty, per the prototype brief. A restart
 * clears the queue.
 *
 * Scope: each entry is tagged with the entity of the session that created it
 * (null for a group session). Listing returns only in-scope entries, and
 * accept and post return 403 for an entry the session cannot see.
 */

/** Longest document text accepted, in characters (UTF-16 code units). */
export const DOCUMENT_TEXT_MAX_CHARS = 200_000;
/** Longest document name accepted, in characters. */
export const DOCUMENT_NAME_MAX_CHARS = 200;

/** A queue summary plus the entity that owns it. `null` means group-wide. */
export type ScopedQueueItem = QueueItemSummary & { entityId: string | null };

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
  name: z
    .string()
    .trim()
    .min(1, 'name is required')
    .max(DOCUMENT_NAME_MAX_CHARS, `name is too long; the limit is ${DOCUMENT_NAME_MAX_CHARS} characters`),
  text: z
    .string()
    .min(1, 'text is required')
    .max(DOCUMENT_TEXT_MAX_CHARS, `text is too long; the limit is ${DOCUMENT_TEXT_MAX_CHARS} characters`),
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

  /** Owning entity per document id. An id with no entry here is group-wide. */
  const owners = new Map<string, string | null>();
  const ownerOf = (documentId: string): string | null => owners.get(documentId) ?? null;
  const tagged = (item: QueueItemSummary): ScopedQueueItem => ({
    ...item,
    entityId: ownerOf(item.documentId),
  });

  /**
   * Unknown ids stay 404. An entry the session cannot see is 403, so the
   * refusal is explicit rather than mistaken for a missing document.
   */
  async function guard(
    c: Context,
    documentId: string,
  ): Promise<{ session: Session } | { denied: Response }> {
    if (queue.get(documentId) === undefined) {
      return {
        denied: c.json(
          {
            error: `no document with id "${documentId}" in the validation queue`,
            code: 'document_not_found' as const,
          },
          404,
        ),
      };
    }

    const session = await readSession(c);
    if (!isInScope(scopeFor(portfolio, session), ownerOf(documentId))) {
      return {
        denied: c.json(
          {
            error: 'document is outside the scope of this session',
            code: 'document_out_of_scope' as const,
          },
          403,
        ),
      };
    }

    return { session };
  }

  const app = new Hono();

  app.get('/api/documents', async (c) => {
    const scope = scopeFor(portfolio, await readSession(c));
    const documents = queue.list().map(tagged).filter((item) => isInScope(scope, item.entityId));
    return c.json({ documents, total: documents.length });
  });

  app.post('/api/documents', async (c) => {
    const read = await readJsonBody(c, BODY_LIMITS.documentCreate);
    if (read.kind === 'too_large') return bodyTooLarge(c, read.limitBytes);

    const parsed = createDocumentSchema.safeParse(read.body);
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

    const session = await readSession(c);
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
      owners.set(documentId, session.entityId);

      return c.json(
        {
          ...tagged(item),
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

    const documentId = c.req.param('id');
    const access = await guard(c, documentId);
    if ('denied' in access) return access.denied;

    const read = await readJsonBody(c, BODY_LIMITS.fieldAccept);
    if (read.kind === 'too_large') return bodyTooLarge(c, read.limitBytes);

    const parsed = fieldValueSchema.safeParse(read.body);
    if (!parsed.success) {
      return c.json(
        { error: 'invalid request body; expected { value: string }', issues: parsed.error.issues },
        400,
      );
    }

    try {
      const result = queue.accept(documentId, key.data, parsed.data.value);
      recordScopedAudit(
        {
          actor: access.session.role,
          action: 'document.field_accepted',
          objectType: 'policy',
          objectId: documentId,
          before: { [key.data]: result.auditEvent.previousValue ?? null },
          after: {
            [key.data]: result.value,
            extractedValue: result.auditEvent.extractedValue ?? null,
          },
        },
        ownerOf(documentId),
      );
      return c.json(result);
    } catch (error) {
      const failure = queueFailure(error);
      if (failure !== undefined) return c.json(failure.body, failure.status);
      throw error;
    }
  });

  app.post('/api/documents/:id/post', async (c) => {
    const documentId = c.req.param('id');
    const access = await guard(c, documentId);
    if ('denied' in access) return access.denied;

    try {
      const posted = queue.post(documentId);
      recordScopedAudit(
        {
          actor: access.session.role,
          action: 'document.posted',
          objectType: 'policy',
          objectId: documentId,
          before: posted.version > 1 ? { version: posted.version - 1 } : null,
          after: {
            version: posted.version,
            documentType: posted.documentType,
            completeness: posted.completeness,
            unconfirmed: [...posted.unconfirmed],
          },
        },
        ownerOf(documentId),
      );
      return c.json(posted);
    } catch (error) {
      const failure = queueFailure(error);
      if (failure !== undefined) return c.json(failure.body, failure.status);
      throw error;
    }
  });

  return app;
}

/** Sub-app for the orchestrator to mount. Starts empty and unconfigured. */
export const documentQueue = new ValidationQueue();

export const documentRoutes = createDocumentRoutes({ queue: documentQueue });

/** The client configured for the mounted sub-app, for routes that share it. */
export function configuredExtractionClient(): ExtractionClient | undefined {
  return configuredClient;
}
