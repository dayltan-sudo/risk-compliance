import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'documents-scope-test-secret-0123456789abcdef';
});

import { fixtureExtractionClient } from '../src/ingestion/fixtureClient';
import { ValidationQueue } from '../src/ingestion/queue';
import { auditRoutes } from '../server/routes/audit';
import { createDocumentRoutes } from '../server/routes/documents';
import { sessionRoutes } from '../server/routes/session';
import { forgedCookie, json, roleCookie } from './scope-http';

/**
 * Item 3: document queue entries belong to the session that created them.
 * Lists, accept and post are scoped; an out-of-scope write is 403; unknown ids
 * stay 404 and duplicate ids stay 409. Accepted fields and posts land in the
 * audit trail under the session role.
 *
 * The fixture client replays by document id, so each test uses fixture ids.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCUMENTS_DIR = join(HERE, '..', 'fixtures', 'documents');

function documentText(id: string): string {
  return readFileSync(join(DOCUMENTS_DIR, `${id}.txt`), 'utf8');
}

function build(): Hono {
  const app = new Hono();
  app.route('/', sessionRoutes);
  app.route('/', createDocumentRoutes({ client: fixtureExtractionClient(), queue: new ValidationQueue() }));
  app.route('/', auditRoutes);
  return app;
}

type Listed = { total: number; documents: Array<{ documentId: string; entityId: string | null }> };
type Audited = { events: Array<{ action: string; objectId: string; actor: string; entityId: string | null }> };

async function createAs(app: Hono, cookie: string | undefined, id: string): Promise<Response> {
  return app.request('/api/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie === undefined ? {} : { Cookie: cookie }) },
    body: JSON.stringify({ id, name: `${id}.txt`, text: documentText(id) }),
  });
}

async function listAs(app: Hono, cookie: string | undefined): Promise<Listed> {
  const response = await app.request('/api/documents', {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });
  expect(response.status).toBe(200);
  return json<Listed>(response);
}

async function acceptAs(app: Hono, cookie: string | undefined, id: string): Promise<Response> {
  return app.request(`/api/documents/${id}/fields/sum_insured`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie === undefined ? {} : { Cookie: cookie }) },
    body: JSON.stringify({ value: 'SGD 15,500,000' }),
  });
}

async function postAs(app: Hono, cookie: string | undefined, id: string): Promise<Response> {
  return app.request(`/api/documents/${id}/post`, {
    method: 'POST',
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });
}

async function auditFor(app: Hono, cookie: string | undefined): Promise<Audited> {
  const response = await app.request('/api/audit?limit=500', {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });
  expect(response.status).toBe(200);
  return json<Audited>(response);
}

describe('document entries are tagged with the creating session', () => {
  it('keeps a group-created entry out of a champion list, and refuses the champion writes with 403', async () => {
    const app = build();

    const created = await createAs(app, undefined, 'slip-cyber-2');
    expect(created.status).toBe(201);
    expect(await json<{ entityId: string | null }>(created)).toMatchObject({ entityId: null });

    const champion = await roleCookie(app, 'Entity Champion');
    expect(await listAs(app, champion)).toEqual({ total: 0, documents: [] });

    const accept = await acceptAs(app, champion, 'slip-cyber-2');
    expect(accept.status).toBe(403);
    expect(await accept.json()).toMatchObject({ code: 'document_out_of_scope' });

    const post = await postAs(app, champion, 'slip-cyber-2');
    expect(post.status).toBe(403);

    // The refused post did not happen: the group still sees an unposted entry.
    const group = await listAs(app, undefined);
    expect(group.documents[0]).toMatchObject({ documentId: 'slip-cyber-2', entityId: null });
    const refusedAudit = await auditFor(app, undefined);
    expect(
      refusedAudit.events.some(
        (event) => event.objectId === 'slip-cyber-2' && event.action === 'document.posted',
      ),
    ).toBe(false);
  });

  it('tags a champion-created entry with its entity, visible to that champion and to group', async () => {
    const app = build();
    const champion = await roleCookie(app, 'Entity Champion');

    const created = await createAs(app, champion, 'slip-property-1');
    expect(created.status).toBe(201);
    expect(await json<{ entityId: string | null }>(created)).toMatchObject({ entityId: 'ent-01' });

    expect(await listAs(app, champion)).toMatchObject({ total: 1 });
    const group = await listAs(app, undefined);
    expect(group.documents).toEqual([
      expect.objectContaining({ documentId: 'slip-property-1', entityId: 'ent-01' }),
    ]);
  });

  it('keeps another entity\'s entries out of a forged ent-02 session, in both directions', async () => {
    const app = build();
    const champion1 = await roleCookie(app, 'Entity Champion');
    await createAs(app, champion1, 'slip-property-1');

    const champion2 = await forgedCookie('Entity Champion', 'ent-02');
    expect(await listAs(app, champion2)).toEqual({ total: 0, documents: [] });
    expect((await acceptAs(app, champion2, 'slip-property-1')).status).toBe(403);
    expect((await postAs(app, champion2, 'slip-property-1')).status).toBe(403);

    const created = await createAs(app, champion2, 'schedule-marine-3');
    expect(await json<{ entityId: string | null }>(created)).toMatchObject({ entityId: 'ent-02' });

    const championOneList = await listAs(app, champion1);
    expect(championOneList.documents.map((item) => item.documentId)).toEqual(['slip-property-1']);
    expect((await postAs(app, champion1, 'schedule-marine-3')).status).toBe(403);
  });

  it('records an in-scope accept and post in the audit trail, actor set to the session role', async () => {
    const app = build();
    const champion = await roleCookie(app, 'Entity Champion');
    await createAs(app, champion, 'slip-property-1');

    const accepted = await acceptAs(app, champion, 'slip-property-1');
    expect(accepted.status).toBe(200);
    const posted = await postAs(app, champion, 'slip-property-1');
    expect(posted.status).toBe(200);

    const trail = await auditFor(app, champion);
    expect(trail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'document.field_accepted',
          objectId: 'slip-property-1',
          actor: 'Entity Champion',
          entityId: 'ent-01',
        }),
        expect.objectContaining({
          action: 'document.posted',
          objectId: 'slip-property-1',
          actor: 'Entity Champion',
          entityId: 'ent-01',
        }),
      ]),
    );

    // The other entity's session cannot read them; group can.
    const other = await auditFor(app, await forgedCookie('Entity Champion', 'ent-02'));
    expect(other.events.some((event) => event.objectId === 'slip-property-1')).toBe(false);
    const group = await auditFor(app, undefined);
    expect(group.events.some((event) => event.objectId === 'slip-property-1' && event.action === 'document.posted')).toBe(true);
  });

  it('lets a group session act on a champion entry, and attributes the event to the entry owner', async () => {
    const app = build();
    const champion = await roleCookie(app, 'Entity Champion');
    await createAs(app, champion, 'endorsement-property-1');

    expect((await acceptAs(app, undefined, 'endorsement-property-1')).status).toBe(200);

    const trail = await auditFor(app, undefined);
    expect(trail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'document.field_accepted',
          objectId: 'endorsement-property-1',
          actor: 'Group Insurance',
          entityId: 'ent-01',
        }),
      ]),
    );
  });

  it('keeps 404 for an unknown id and 409 for a duplicate id, for every session', async () => {
    const app = build();
    const champion = await roleCookie(app, 'Entity Champion');

    expect((await acceptAs(app, champion, 'missing-doc')).status).toBe(404);
    expect((await postAs(app, undefined, 'missing-doc')).status).toBe(404);

    expect((await createAs(app, undefined, 'wording-cyber-2')).status).toBe(201);
    expect((await createAs(app, undefined, 'wording-cyber-2')).status).toBe(409);
  });
});
