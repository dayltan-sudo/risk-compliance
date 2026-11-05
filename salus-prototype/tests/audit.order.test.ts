import { describe, expect, it } from 'vitest';

import app from '../server/index';

/**
 * The Audit screen is labelled "Newest first". A seeded row inserted out of
 * timestamp order broke that while the label stayed, so the ordering is now
 * asserted rather than assumed from array position.
 */

interface AuditBody {
  events: Array<{ id: string; at: string }>;
  total: number;
}

describe('GET /api/audit ordering', () => {
  it('returns events newest first by timestamp', async () => {
    const response = await app.request('/api/audit?limit=500');
    expect(response.status).toBe(200);

    const body = (await response.json()) as AuditBody;
    const timestamps = body.events.map((event) => event.at);

    expect(timestamps.length).toBeGreaterThan(5);
    expect(timestamps).toEqual([...timestamps].sort().reverse());
  });

  it('honours a smaller limit without changing the order', async () => {
    const full = (await (await app.request('/api/audit?limit=500')).json()) as AuditBody;
    const short = (await (await app.request('/api/audit?limit=3')).json()) as AuditBody;

    expect(short.events.map((event) => event.id)).toEqual(
      full.events.slice(0, 3).map((event) => event.id),
    );
  });
});
