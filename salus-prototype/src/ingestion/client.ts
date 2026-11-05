import { buildExtractionPrompt } from './extract';
import { rawExtractionSchema } from './schema';

/**
 * The one dependency the ingestion pipeline has on a model.
 *
 * `ExtractionClient` is deliberately narrow: text and an optional type hint go
 * in, unknown JSON comes out. `extractDocument` validates that JSON against
 * `schema.ts`, so a client implementation cannot skip the contract by returning
 * a shaped object of its own.
 */
export type ExtractionRequest = {
  documentId: string;
  text: string;
  documentTypeHint?: string;
};

export type ExtractionClient = {
  extract(req: ExtractionRequest): Promise<unknown>;
};

export interface OpenAiExtractionClientConfig {
  /** OpenAI-compatible base URL, e.g. `https://api.openai.com/v1`. */
  baseUrl: string;
  /** Sent as a bearer token when non-empty. Local servers may not need one. */
  apiKey: string;
  model: string;
}

const ERROR_DETAIL_LIMIT = 400;

function snippet(value: string, limit = ERROR_DETAIL_LIMIT): string {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}...`;
}

/**
 * Accept either a base URL or a full chat-completions URL so the caller can
 * paste whichever one their provider documents.
 */
function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed === '') throw new Error('openAiExtractionClient: baseUrl is required');
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
}

/** Pull `choices[0].message.content` out of an unknown response body. */
function messageContent(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('extraction response was not a JSON object');
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('extraction response did not contain a choices array');
  }

  const first: unknown = choices[0];
  const content =
    typeof first === 'object' && first !== null
      ? (first as { message?: { content?: unknown } }).message?.content
      : undefined;

  if (typeof content !== 'string') {
    throw new Error('extraction response did not contain choices[0].message.content');
  }

  return content;
}

/**
 * Calls an OpenAI-compatible chat completions endpoint with `response_format:
 * json_object` and returns the parsed, schema-validated extraction.
 *
 * Configuration is passed in by the caller. This module never reads
 * `process.env`, so constructing a client cannot accidentally pick up a key and
 * start making network calls in a test.
 */
export function openAiExtractionClient(env: OpenAiExtractionClientConfig): ExtractionClient {
  const url = chatCompletionsUrl(env.baseUrl);
  const model = env.model.trim();
  if (model === '') throw new Error('openAiExtractionClient: model is required');

  return {
    async extract(req: ExtractionRequest): Promise<unknown> {
      const hint =
        req.documentTypeHint === undefined || req.documentTypeHint.trim() === ''
          ? ''
          : `\n\nDocument type hint from the caller (verify it against the document, do not trust it over the text): ${req.documentTypeHint.trim()}`;

      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (env.apiKey.trim() !== '') headers['authorization'] = `Bearer ${env.apiKey.trim()}`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: `${buildExtractionPrompt(req.text)}${hint}` }],
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `extraction request failed with HTTP ${response.status}${detail === '' ? '' : `: ${snippet(detail)}`}`,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('extraction response body was not valid JSON');
      }

      const content = messageContent(payload);

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`extraction response was not valid JSON (${reason}); received: ${snippet(content)}`);
      }

      const validated = rawExtractionSchema.safeParse(parsed);
      if (!validated.success) {
        throw new Error(`extraction response did not match the extraction schema: ${validated.error.message}`);
      }

      return validated.data;
    },
  };
}
