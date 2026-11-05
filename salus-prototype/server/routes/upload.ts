import { Hono } from 'hono';

import { extractDocument, extractFromRaw } from '../../src/ingestion/extract';
import type { ExtractionClient } from '../../src/ingestion/client';
import { extractUploadText, MAX_UPLOAD_BYTES, pagesToText, UploadError } from '../../src/ingestion/fileText';
import { QueueError, type ValidationQueue } from '../../src/ingestion/queue';
import { extractByRules } from '../../src/ingestion/rules';

/**
 * Real file upload: multipart in, validated draft out.
 *
 * The parser is chosen by what the file actually is, and the extraction source
 * is reported honestly:
 * - `model` when an extraction client is configured
 * - `rules` when it is not, which reads labelled lines deterministically
 *
 * A reviewer needs to know which of the two produced the fields, so the response
 * says so and the UI shows it. Claiming a model read when nothing was called
 * would be the one lie this prototype cannot afford.
 */

export interface UploadRoutesOptions {
  queue: ValidationQueue;
  /** Resolved per request so a client configured later still applies. */
  resolveClient: () => ExtractionClient | undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function randomDocumentId(): string {
  return `doc-${crypto.randomUUID()}`;
}

export function createUploadRoutes(options: UploadRoutesOptions): Hono {
  const app = new Hono();

  app.post('/api/documents/upload', async (c) => {
    let form: Record<string, unknown>;
    try {
      form = (await c.req.parseBody()) as Record<string, unknown>;
    } catch (error) {
      return c.json({ error: 'expected a multipart form upload', detail: messageOf(error) }, 400);
    }

    const file = form['file'];
    if (!(file instanceof File)) {
      return c.json({ error: 'expected a multipart field named "file"' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json(
        {
          error: 'file_too_large',
          detail: `file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${
            MAX_UPLOAD_BYTES / 1024 / 1024
          } MB`,
        },
        413,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const requestedId = typeof form['documentId'] === 'string' ? form['documentId'].trim() : '';
    const documentId = requestedId === '' ? randomDocumentId() : requestedId;

    let parsedFile;
    try {
      parsedFile = await extractUploadText(file.name, bytes);
    } catch (error) {
      if (error instanceof UploadError) {
        const status = error.code === 'too_large' ? 413 : 400;
        return c.json({ error: error.code, detail: error.message }, status);
      }
      return c.json({ error: 'unreadable', detail: messageOf(error) }, 400);
    }

    if (parsedFile.emptyTextLayer) {
      return c.json(
        {
          error: 'no_text_layer',
          detail:
            'the PDF parsed but carries no text; it is probably a scan. OCR is not part of this prototype, and inventing fields from an image would be worse than refusing.',
        },
        422,
      );
    }

    const client = options.resolveClient();
    const source: 'model' | 'rules' = client === undefined ? 'rules' : 'model';

    let extracted;
    try {
      extracted =
        client === undefined
          ? extractFromRaw(extractByRules(parsedFile.pages), { documentId })
          : await extractDocument(pagesToText(parsedFile.pages), client, { documentId });
    } catch (error) {
      return c.json({ error: 'extraction failed', detail: messageOf(error) }, 502);
    }

    try {
      const item = options.queue.enqueue({
        documentId,
        name: file.name,
        normalised: extracted.normalised,
      });

      return c.json(
        {
          ...item,
          extraction: {
            source,
            kind: parsedFile.kind,
            pages: parsedFile.pages.length,
            documentType: extracted.raw.documentType,
            bytes: bytes.byteLength,
          },
          draft: extracted.draft,
          raw: extracted.raw,
          accepted: extracted.normalised.accepted,
          queued: extracted.normalised.queued,
          rejected: extracted.normalised.rejected,
        },
        201,
      );
    } catch (error) {
      if (error instanceof QueueError) {
        const status = error.code === 'document_not_found' ? 404 : error.code === 'duplicate_document' ? 409 : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  return app;
}
