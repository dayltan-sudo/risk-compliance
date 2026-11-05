import { describe, expect, it } from 'vitest';
import app from '../server/index';
import { portfolio } from '../src/data/portfolio';
import { roleCookie } from './scope-http';

describe('GET /api/health', () => {
  it('reports ok without touching a database', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: 'salus-api',
      mode: 'seed',
      extraction: expect.any(String),
    });
  });
});

describe('GET /api/summary', () => {
  it('serves the seeded roll-up', async () => {
    const response = await app.request('/api/summary');
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.asOf).toBe('2026-11-05');
    expect(body.source).toBe('seed');
    expect(body.requirementCounts).toEqual({
      Met: 8,
      'At-risk': 3,
      Gap: 4,
      Excluded: 3,
      total: 18,
    });
    expect(body.renewals).toEqual({ d30: 1, d60: 2, d90: 3 });
    expect(Array.isArray(body.hotspots)).toBe(true);
  });

  it('accepts an asOf override', async () => {
    const response = await app.request('/api/summary?asOf=2026-12-01');
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.asOf).toBe('2026-12-01');
    expect(body.renewals).toEqual({ d30: 1, d60: 2, d90: 2 });
  });

  it('rejects a malformed asOf instead of silently using the default', async () => {
    const response = await app.request('/api/summary?asOf=05-11-2026');
    expect(response.status).toBe(400);
  });
});

describe('GET /api/summary is scoped to the session', () => {
  type Summary = {
    role: string;
    scope: { kind: string; entityIds: string[] };
    tivSgd: number;
    adequacyPct: number;
    hotspots: Array<{ entityId: string }>;
    requirementCounts: { total: number };
  };

  it('serves a group role exactly the group figures', async () => {
    for (const role of ['Group Insurance', 'R&C Manager', 'Auditor'] as const) {
      const response = await app.request('/api/summary', {
        headers: { Cookie: await roleCookie(app, role) },
      });
      const body = (await response.json()) as Summary;

      expect(body.role).toBe(role);
      expect(body.scope.kind).toBe('group');
      expect(body.tivSgd).toBe(3_576_000_000);
      expect(body.adequacyPct).toBe(90.03);
      expect(body.requirementCounts.total).toBe(18);
    }
  });

  it('gives an Entity Champion their own entity figures, and a smaller body than the group', async () => {
    const groupText = await (await app.request('/api/summary')).text();

    const championText = await (
      await app.request('/api/summary', { headers: { Cookie: await roleCookie(app, 'Entity Champion') } })
    ).text();
    const body = JSON.parse(championText) as Summary;

    const ownTiv = portfolio.sites
      .filter((site) => site.entityId === 'ent-01')
      .reduce((sum, site) => sum + site.tivSgd, 0);

    expect(body.role).toBe('Entity Champion');
    expect(body.scope).toMatchObject({ kind: 'entity', entityIds: ['ent-01'] });
    expect(body.tivSgd).toBeCloseTo(ownTiv, 2);
    expect(body.tivSgd).toBeLessThan(3_576_000_000);
    expect(body.hotspots.every((hotspot) => hotspot.entityId === 'ent-01')).toBe(true);
    expect(body.requirementCounts.total).toBeLessThan(18);
    expect(championText.length).toBeLessThan(groupText.length);
  });
});
