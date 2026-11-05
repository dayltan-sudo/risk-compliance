/**
 * Request body limits for the JSON write routes.
 *
 * A body over its route limit is refused from its length (Content-Length when
 * sent, otherwise the bytes actually read) before it is parsed, so a multi-MB
 * body never reaches `JSON.parse` or zod. Each limit is the largest valid
 * request for its route with every character escaped as `\uXXXX` (six bytes),
 * so no request that a field limit would accept is refused here.
 */
import type { Context } from 'hono';

export const BODY_LIMITS = {
  /** 200,000 text characters at six bytes each, plus name, id and envelope. */
  documentCreate: 1_310_720,
  /** A 20,000-character value at six bytes each, plus envelope. */
  fieldAccept: 131_072,
  /** A 2,000-character question and an 80-character page at six bytes each. */
  assistantAsk: 16_384,
  /**
   * A 2,000-character note, a 200-character site name and a 60-character policy
   * number at six bytes each, plus the amounts and envelope.
   */
  questionnaire: 16_384,
  /** A role name and envelope. */
  sessionRole: 4_096,
} as const;

export type BodyRead = { kind: 'ok'; body: unknown } | { kind: 'too_large'; limitBytes: number };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Read the request body up to `limitBytes`, then parse it as JSON. Malformed
 * JSON comes back as `undefined` so the caller's schema reports it as a 400,
 * the same as before this helper existed.
 */
export async function readJsonBody(c: Context, limitBytes: number): Promise<BodyRead> {
  const declared = Number(c.req.header('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > limitBytes) {
    return { kind: 'too_large', limitBytes };
  }

  const stream = c.req.raw.body;
  if (stream === null) return { kind: 'ok', body: undefined };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limitBytes) {
      await reader.cancel().catch(() => undefined);
      return { kind: 'too_large', limitBytes };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { kind: 'ok', body: parseJson(new TextDecoder().decode(bytes)) };
}

/** The 413 every route returns for an oversized body. */
export function bodyTooLarge(c: Context, limitBytes: number): Response {
  return c.json(
    { error: `request body is too large; the limit for this route is ${limitBytes} bytes`, limitBytes },
    413,
  );
}
