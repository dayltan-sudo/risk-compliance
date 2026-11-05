import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'assistant-scope-test-secret-0123456789abcdef';
});

import type { AssistantModel } from '../src/assistant/client';
import { createAssistantRoutes } from '../server/routes/assistant';
import { sessionRoutes } from '../server/routes/session';
import { forgedCookie, json, roleCookie } from './scope-http';

/**
 * The assistant answers from the group portfolio (its tools read it directly),
 * so a scoped session is refused with 403 and the model is never called.
 */

function spyModel(): { model: AssistantModel; calls: { count: number } } {
  const calls = { count: 0 };
  const model: AssistantModel = {
    async complete() {
      calls.count += 1;
      return { text: 'The records do not contain that.', toolCalls: [] };
    },
  };
  return { model, calls };
}

function build(): { app: Hono; calls: { count: number } } {
  const { model, calls } = spyModel();
  const app = new Hono();
  app.route('/', sessionRoutes);
  app.route('/', createAssistantRoutes({ model }));
  return { app, calls };
}

async function ask(app: Hono, cookie: string | undefined): Promise<Response> {
  return app.request('/api/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie === undefined ? {} : { Cookie: cookie }) },
    body: JSON.stringify({ question: 'What is the group TIV?' }),
  });
}

describe('POST /api/assistant is group-only', () => {
  it('answers a group session', async () => {
    const { app, calls } = build();
    const response = await ask(app, undefined);

    expect(response.status).toBe(200);
    expect(await json<{ refused: boolean }>(response)).toMatchObject({ refused: true });
    expect(calls.count).toBeGreaterThan(0);
  });

  it('refuses an Entity Champion with 403, without calling the model', async () => {
    const { app, calls } = build();
    const champion = await roleCookie(app, 'Entity Champion');

    const response = await ask(app, champion);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'assistant_group_only' });
    expect(calls.count).toBe(0);
  });

  it('refuses a forged ent-02 champion the same way', async () => {
    const { app, calls } = build();
    const response = await ask(app, await forgedCookie('Entity Champion', 'ent-02'));

    expect(response.status).toBe(403);
    expect(calls.count).toBe(0);
  });
});
