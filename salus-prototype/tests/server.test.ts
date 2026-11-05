import { describe, expect, it } from 'vitest';
import app from '../server/index';

describe('GET /api/health', () => {
  it('reports ok without touching a database', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'salus-api', mode: 'seed' });
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
