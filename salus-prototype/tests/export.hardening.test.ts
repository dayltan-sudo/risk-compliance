import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'export-hardening-test-secret-0123456789abcdef';
});

import { portfolio } from '../src/data/portfolio';
import app from '../server/index';
import { csvCell, toCsv } from '../server/routes/export';
import { forgedCookie, json, roleCookie } from './scope-http';

/**
 * Item 5: CSV formula injection. A cell that starts with = + - @ TAB or CR is
 * prefixed with an apostrophe, inside any quoting.
 * Item 6 (export part): each CSV export is written to the audit trail with the
 * session role as actor.
 */

describe('csvCell formula neutralisation', () => {
  const cases: Array<[string | number | null | undefined, string]> = [
    ['=1+1', "'=1+1"],
    ['+61 2 0000', "'+61 2 0000"],
    ['-5', "'-5"],
    [-5, "'-5"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['\tcmd', "'\tcmd"],
    ['\rcmd', "\"'\rcmd\""],
    ['=a,b', "\"'=a,b\""],
    ['=HYPERLINK("http://x","y")', "\"'=HYPERLINK(\"\"http://x\"\",\"\"y\"\")\""],
    ['plain', 'plain'],
    ['a=b', 'a=b'],
    ['a-b', 'a-b'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    [25_000_000, '25000000'],
    ['SGD 12,000,000', '"SGD 12,000,000"'],
  ];

  it.each(cases)('renders %j as %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('neutralises a hostile row inside a CSV document without touching the other cells', () => {
    const csv = toCsv(['id', 'note'], [['row-1', '=cmd|" /C calc"!A0'], ['row-2', 'ok']]);
    expect(csv).toBe('id,note\r\nrow-1,"\'=cmd|"" /C calc""!A0"\r\nrow-2,ok\r\n');
  });
});

describe('seeded CSV exports', () => {
  it.each(['policies', 'requirements', 'exclusions'])(
    'has no cell that a spreadsheet would read as a formula: %s',
    async (entity) => {
      const response = await app.request(`/api/export/${entity}.csv`);
      const text = await response.text();
      // A cell starts at the line start, after a comma, or after an opening quote.
      expect(/(^|,|\n)"?[=+\-@\t\r]/.test(text)).toBe(false);
    },
  );
});

describe('CSV export audit trail', () => {
  it('records a champion export as their entity, attributed to the Entity Champion role', async () => {
    const champion = await roleCookie(app, 'Entity Champion');
    const response = await app.request('/api/export/policies.csv', { headers: { Cookie: champion } });
    expect(response.status).toBe(200);

    const ownPolicies = portfolio.policies.filter((policy) => policy.entityId === 'ent-01').length;
    const trail = await json<{
      events: Array<{ action: string; objectType: string; objectId: string; actor: string; entityId: string | null; after: { rows: number } }>;
    }>(await app.request('/api/audit?limit=500', { headers: { Cookie: champion } }));

    expect(trail.events[0]).toMatchObject({
      action: 'export.csv',
      objectType: 'policy',
      objectId: 'salus-policies.csv',
      actor: 'Entity Champion',
      entityId: 'ent-01',
      after: { rows: ownPolicies },
    });
  });

  it('records a group export as group-wide, so an entity session cannot see it', async () => {
    await app.request('/api/export/requirements.csv');

    const group = await json<{ events: Array<{ action: string; objectId: string; actor: string; entityId: string | null }> }>(
      await app.request('/api/audit?limit=500'),
    );
    expect(group.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'export.csv',
          objectId: 'salus-requirements.csv',
          actor: 'Group Insurance',
          entityId: null,
        }),
      ]),
    );

    const forged = await forgedCookie('Entity Champion', 'ent-02');
    const other = await json<{ events: Array<{ objectId: string }> }>(
      await app.request('/api/audit?limit=500', { headers: { Cookie: forged } }),
    );
    expect(other.events.some((event) => event.objectId === 'salus-requirements.csv')).toBe(false);
  });

  it('does not record an export for an unknown file name', async () => {
    const before = await json<{ total: number }>(await app.request('/api/audit?limit=1'));
    const response = await app.request('/api/export/sites.csv');
    expect(response.status).toBe(404);
    const after = await json<{ total: number }>(await app.request('/api/audit?limit=1'));
    expect(after.total).toBe(before.total);
  });
});
