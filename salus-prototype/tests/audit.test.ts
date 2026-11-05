import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_DEFAULT_LIMIT,
  AUDIT_MAX_LIMIT,
  countAudit,
  listAudit,
  recordAudit,
} from '../src/audit/store';
import type { AuditEventInput, AuditListResponse } from '../src/audit/types';
import { auditRoutes } from '../server/routes/audit';

/**
 * The audit store is the one place in the prototype that must not allow
 * mutation: a governance log that can be edited is not a governance log.
 * These tests exercise the store directly, then the read-only HTTP surface.
 */

const app = new Hono();
app.route('/', auditRoutes);

function append(objectId: string, objectType = 'policy'): AuditEventInput {
  return {
    actor: 'Test Actor (Auditor)',
    action: `${objectType}.tested`,
    objectType,
    objectId,
    before: null,
    after: { note: `appended ${objectId}` },
  };
}

describe('audit store append-only behaviour', () => {
  it('assigns the id and timestamp, appends one row and lists it newest first', () => {
    const before = countAudit();
    const event = recordAudit(append('pol-append-1'));

    expect(event.id).toMatch(/^aud-\d{4}$/);
    expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(countAudit()).toBe(before + 1);

    const newest = listAudit({ limit: 1 });
    expect(newest).toHaveLength(1);
    expect(newest[0]).toEqual(event);
  });

  it('returns frozen records, so a caller cannot rewrite history through a reference', () => {
    const event = recordAudit({
      actor: 'Test Actor (Auditor)',
      action: 'coverage.tested',
      objectType: 'coverage',
      objectId: 'cov-frozen',
      before: { version: 1, limitOcc: 1_000 },
      after: { version: 2, limitOcc: 2_000 },
    });

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.before)).toBe(true);
    expect(Object.isFrozen(event.after)).toBe(true);

    expect(() => {
      (event as { actor: string }).actor = 'Someone Else';
    }).toThrow(TypeError);
    expect(event.actor).toBe('Test Actor (Auditor)');
  });

  it('never reuses an id or reorders an earlier record', () => {
    const first = recordAudit(append('pol-order-1'));
    const second = recordAudit(append('pol-order-2'));

    expect(second.id).not.toBe(first.id);
    expect(listAudit({ limit: 2 }).map((event) => event.id)).toEqual([second.id, first.id]);
    expect(listAudit({ objectType: 'policy' }).filter((event) => event.id === first.id)).toHaveLength(
      1,
    );
  });
});

describe('audit store filters and clamping', () => {
  it('filters by objectType without changing the store total', () => {
    recordAudit(append('exc-filter', 'exclusion'));
    recordAudit(append('pol-filter', 'policy'));
    const total = countAudit();

    const exclusions = listAudit({ objectType: 'exclusion', limit: AUDIT_MAX_LIMIT });
    expect(exclusions.length).toBeGreaterThan(0);
    expect(exclusions.every((event) => event.objectType === 'exclusion')).toBe(true);
    expect(exclusions[0]?.objectId).toBe('exc-filter');
    expect(countAudit()).toBe(total);
  });

  it('clamps a zero, negative or fractional limit instead of throwing', () => {
    expect(listAudit({ limit: 0 })).toEqual([]);
    expect(listAudit({ limit: -5 })).toEqual([]);
    expect(listAudit({ limit: 2.9 })).toHaveLength(Math.min(2, countAudit()));
  });

  it('falls back to the default limit for a non-finite value', () => {
    expect(listAudit({ limit: Number.NaN })).toHaveLength(
      Math.min(AUDIT_DEFAULT_LIMIT, countAudit()),
    );
    expect(listAudit({ limit: Number.POSITIVE_INFINITY })).toHaveLength(
      Math.min(AUDIT_DEFAULT_LIMIT, countAudit()),
    );
  });

  it('caps an oversized limit at AUDIT_MAX_LIMIT', () => {
    // Enough rows to make the cap observable rather than incidental.
    for (let index = 0; index < AUDIT_MAX_LIMIT + 5; index += 1) {
      recordAudit(append(`bulk-${index}`, 'config'));
    }

    expect(listAudit({ limit: 10_000 })).toHaveLength(AUDIT_MAX_LIMIT);
  });
});

describe('GET /api/audit', () => {
  it('returns AuditListResponse with the requested filter and limit', async () => {
    const response = await app.request('/api/audit?objectType=policy&limit=2');
    expect(response.status).toBe(200);

    const body = (await response.json()) as AuditListResponse;
    expect(body.objectType).toBe('policy');
    expect(body.count).toBe(2);
    expect(body.events).toHaveLength(2);
    expect(body.events.every((event) => event.objectType === 'policy')).toBe(true);
    expect(body.total).toBe(countAudit());
  });

  it('returns the whole log with objectType null when no filter is supplied', async () => {
    const response = await app.request('/api/audit');
    expect(response.status).toBe(200);

    const body = (await response.json()) as AuditListResponse;
    expect(body.objectType).toBeNull();
    expect(body.count).toBe(Math.min(AUDIT_DEFAULT_LIMIT, countAudit()));
    expect(body.total).toBe(countAudit());
  });

  it('clamps an oversized limit at the route rather than failing', async () => {
    const response = await app.request('/api/audit?limit=9999');
    expect(response.status).toBe(200);

    const body = (await response.json()) as AuditListResponse;
    expect(body.count).toBeLessThanOrEqual(AUDIT_MAX_LIMIT);
    expect(body.count).toBe(Math.min(AUDIT_MAX_LIMIT, countAudit()));
  });

  it('rejects an unknown objectType or a nonsense limit', async () => {
    expect((await app.request('/api/audit?objectType=nope')).status).toBe(400);
    expect((await app.request('/api/audit?limit=abc')).status).toBe(400);
    expect((await app.request('/api/audit?limit=-1')).status).toBe(400);
    expect((await app.request('/api/audit?limit=1.5')).status).toBe(400);
  });

  it('exposes no write path', async () => {
    expect((await app.request('/api/audit', { method: 'POST', body: '{}' })).status).toBe(404);
    expect((await app.request('/api/audit', { method: 'DELETE' })).status).toBe(404);
    expect((await app.request('/api/audit/aud-0001', { method: 'PATCH' })).status).toBe(404);
  });
});
