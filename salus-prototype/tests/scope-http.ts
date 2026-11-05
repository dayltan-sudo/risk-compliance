import type { Hono } from 'hono';
import { SignJWT } from 'jose';
import { expect } from 'vitest';

/**
 * Shared HTTP helpers for the scope tests.
 *
 * `roleCookie` goes through the real role switcher, so it is what a browser
 * would get. `forgedCookie` signs a session the switcher cannot produce (an
 * entity other than the default champion). It needs the same secret the server
 * read, so a test file must set `process.env.SESSION_SECRET` inside
 * `vi.hoisted` before it imports anything that loads `server/routes/session.ts`.
 */

export const SESSION_COOKIE = 'salus_session';

/** `name=value` from the first Set-Cookie header, ready to send back as `Cookie`. */
export function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie');
  expect(header).not.toBeNull();
  return (header ?? '').split(';')[0] ?? '';
}

/** Switch the demo role and return the cookie the server issued for it. */
export async function roleCookie(app: Hono, role: string): Promise<string> {
  const response = await app.request('/api/session/role', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

/** A correctly signed session for any role and entity, for tests only. */
export async function forgedCookie(role: string, entityId: string | null): Promise<string> {
  const secret = process.env['SESSION_SECRET'];
  if (secret === undefined || secret === '') {
    throw new Error('forgedCookie: set SESSION_SECRET in vi.hoisted before importing the server');
  }
  const token = await new SignJWT({ role, entityId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
  return `${SESSION_COOKIE}=${token}`;
}

/** Read a JSON body as `T`, asserting the response is JSON. */
export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
