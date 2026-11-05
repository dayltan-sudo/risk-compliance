import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'audit-scope-test-secret-0123456789abcdef';
});

import { countAudit } from '../src/audit/store';
import type { AuditEvent } from '../src/audit/types';
import app from '../server/index';
import { forgedCookie, json, roleCookie } from './scope-http';

/**
 * Item 2: audit events carry the owning entity. A session sees its own
 * entity's events, and unowned events (session, config) only as a group role.
 * The seed events are owned by the entity of the object they point at:
 * aud-0003 (pol-15) belongs to ent-02, aud-0006 (pol-07) to ent-03, and the
 * config and session events to no entity.
 */

type ScopedEvent = AuditEvent & { entityId: string | null };
type Listing = { count: number; total: number; events: ScopedEvent[] };

async function listAs(cookie: string | undefined, query = 'limit=500'): Promise<Listing> {
  const response = await app.request(`/api/audit?${query}`, {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });
  expect(response.status).toBe(200);
  return json<Listing>(response);
}

function byId(events: ScopedEvent[], id: string): ScopedEvent | undefined {
  return events.find((event) => event.id === id);
}

describe('audit events carry an owning entity', () => {
  it('gives every event an entityId, and resolves the seed events to the entity they describe', async () => {
    const group = await listAs(undefined);

    expect(group.events.every((event) => 'entityId' in event)).toBe(true);
    // Each seed event takes the owner of the object it points at (site-04 is ent-02).
    expect(byId(group.events, 'aud-0002')?.entityId).toBe('ent-02');
    expect(byId(group.events, 'aud-0003')?.entityId).toBe('ent-02');
    expect(byId(group.events, 'aud-0004')?.entityId).toBe('ent-02');
    expect(byId(group.events, 'aud-0005')?.entityId).toBe('ent-02');
    expect(byId(group.events, 'aud-0006')?.entityId).toBe('ent-03');
    expect(byId(group.events, 'aud-0007')?.entityId).toBe('ent-04');
    expect(byId(group.events, 'aud-0001')?.entityId).toBeNull();
    expect(byId(group.events, 'aud-0008')?.entityId).toBeNull();
  });
});

describe('GET /api/audit is filtered by session scope', () => {
  it('shows an Entity Champion only events for their own entity', async () => {
    const champion = await roleCookie(app, 'Entity Champion');
    const own = await listAs(champion);
    const group = await listAs(undefined);

    expect(own.events.every((event) => event.entityId === 'ent-01')).toBe(true);
    // Unowned events are group-only, so none of them reach a champion.
    expect(own.events.some((event) => event.objectType === 'session')).toBe(false);
    expect(own.events.some((event) => event.objectType === 'config')).toBe(false);

    // The champion's list is exactly the group's ent-01 events.
    const expected = group.events
      .filter((event) => event.entityId === 'ent-01')
      .map((event) => event.id);
    expect(own.events.map((event) => event.id)).toEqual(expected);
  });

  it('excludes another entity\'s events from an ent-02 champion, and from ent-03', async () => {
    const ent02 = await listAs(await forgedCookie('Entity Champion', 'ent-02'));
    expect(byId(ent02.events, 'aud-0003')).toBeDefined();
    expect(byId(ent02.events, 'aud-0006')).toBeUndefined();

    const ent03 = await listAs(await forgedCookie('Entity Champion', 'ent-03'));
    expect(byId(ent03.events, 'aud-0006')).toBeDefined();
    expect(byId(ent03.events, 'aud-0003')).toBeUndefined();
  });

  it('shows a group role every event, unowned included, with the true store total', async () => {
    for (const role of ['Group Insurance', 'R&C Manager', 'Auditor'] as const) {
      const listing = await listAs(await roleCookie(app, role));
      expect(listing.events.some((event) => event.objectType === 'session')).toBe(true);
      expect(listing.total).toBe(countAudit());
    }
  });

  it('applies the limit after the scope filter, so an in-scope event is never cut off', async () => {
    const champion = await roleCookie(app, 'Entity Champion');
    // The seed history has no ent-01 event, so record one the champion owns first.
    await app.request('/api/export/policies.csv', { headers: { Cookie: champion } });

    const everything = await listAs(champion);
    expect(everything.events.length).toBeGreaterThan(0);

    const one = await listAs(champion, 'limit=1');
    expect(one.count).toBe(1);
    expect(one.events[0]?.id).toBe(everything.events[0]?.id);

    // The champion's total counts what they can see, not the group's log size.
    expect(everything.total).toBe(everything.events.length);
    expect(everything.total).toBeLessThan(countAudit());
  });

  it('filters by objectType within the scope', async () => {
    const champion = await roleCookie(app, 'Entity Champion');
    const policies = await listAs(champion, 'objectType=policy&limit=500');

    expect(policies.events.every((event) => event.objectType === 'policy')).toBe(true);
    expect(policies.events.every((event) => event.entityId === 'ent-01')).toBe(true);
    expect(byId(policies.events, 'aud-0003')).toBeUndefined();
  });
});
