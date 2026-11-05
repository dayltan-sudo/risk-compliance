import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CHAMPION_ENTITY_ID,
  ROLES,
  type Role,
  type ScopedPortfolioResponse,
  type Session,
  type SessionResponse,
} from '../src/audit/types';
import { portfolio } from '../src/data/portfolio';
import { isInScope, scopeFor, scopedPortfolio } from '../server/middleware/scope';
import { exportRoutes, toCsv } from '../server/routes/export';
import { SESSION_COOKIE_NAME, sessionRoutes } from '../server/routes/session';

/**
 * Server-enforced entity scope, and the CSV export that must inherit it.
 * The demo is only honest if an Entity Champion cannot pull another entity's
 * rows out of the API, so these tests go through the HTTP surface as well as
 * the pure `scopedPortfolio` function.
 */

const GROUP_ROLES: readonly Role[] = ['Group Insurance', 'R&C Manager', 'Auditor'];

function server(): Hono {
  const app = new Hono();
  app.route('/', sessionRoutes);
  app.route('/', exportRoutes);
  return app;
}

function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie');
  expect(header).not.toBeNull();
  expect(header?.toLowerCase()).toContain('httponly');

  const pair = header?.split(';')[0] ?? '';
  expect(pair.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);

  // A compact JWS: header.payload.signature. The route verifies it on read,
  // which is what makes the role un-editable from the browser.
  const token = pair.slice(pair.indexOf('=') + 1);
  expect(token.split('.')).toHaveLength(3);

  return pair;
}

async function switchTo(app: Hono, role: Role): Promise<string> {
  const response = await app.request('/api/session/role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

describe('scopedPortfolio', () => {
  it('returns only the champion entity across every row list', () => {
    const session: Session = {
      role: 'Entity Champion',
      entityId: DEFAULT_CHAMPION_ENTITY_ID,
    };
    const scoped = scopedPortfolio(portfolio, session);

    expect(scoped.entities.map((entity) => entity.id)).toEqual([DEFAULT_CHAMPION_ENTITY_ID]);
    expect(scoped.sites.length).toBeGreaterThan(0);
    expect(scoped.policies.length).toBeGreaterThan(0);
    expect(scoped.sites.every((site) => site.entityId === DEFAULT_CHAMPION_ENTITY_ID)).toBe(true);
    expect(scoped.policies.every((policy) => policy.entityId === DEFAULT_CHAMPION_ENTITY_ID)).toBe(
      true,
    );

    const siteIds = new Set(scoped.sites.map((site) => site.id));
    const policyIds = new Set(scoped.policies.map((policy) => policy.id));

    expect(scoped.assets.every((asset) => siteIds.has(asset.siteId))).toBe(true);
    expect(scoped.coverages.every((coverage) => siteIds.has(coverage.siteId))).toBe(true);
    expect(scoped.requirements.every((requirement) => siteIds.has(requirement.siteId))).toBe(true);
    expect(scoped.exclusions.every((exclusion) => siteIds.has(exclusion.siteId))).toBe(true);
    expect(scoped.premiums.every((premium) => policyIds.has(premium.policyId))).toBe(true);

    const ownPolicyNumbers = new Set(scoped.policies.map((policy) => policy.policyNo));
    const otherPolicyNumbers = portfolio.policies
      .filter((policy) => policy.entityId !== DEFAULT_CHAMPION_ENTITY_ID)
      .map((policy) => policy.policyNo);

    expect(otherPolicyNumbers.length).toBeGreaterThan(0);
    expect(otherPolicyNumbers.some((policyNo) => ownPolicyNumbers.has(policyNo))).toBe(false);
  });

  it('returns the full portfolio for every group-wide role', () => {
    for (const role of GROUP_ROLES) {
      const session: Session = { role, entityId: null };
      const scoped = scopedPortfolio(portfolio, session);

      expect(scoped).toBe(portfolio);
      expect(scoped.entities).toHaveLength(portfolio.entities.length);
      expect(scoped.sites).toHaveLength(portfolio.sites.length);
      expect(scoped.policies).toHaveLength(portfolio.policies.length);
      expect(scoped.requirements).toHaveLength(portfolio.requirements.length);
      expect(scoped.exclusions).toHaveLength(portfolio.exclusions.length);
    }
  });

  it('denies an unassigned or unknown champion an empty book, never the group', () => {
    const sessions: Session[] = [
      { role: 'Entity Champion', entityId: null },
      { role: 'Entity Champion', entityId: 'ent-does-not-exist' },
    ];

    for (const session of sessions) {
      const scoped = scopedPortfolio(portfolio, session);
      expect(scoped.entities).toEqual([]);
      expect(scoped.sites).toEqual([]);
      expect(scoped.policies).toEqual([]);
      expect(scopeFor(portfolio, session).entityCount).toBe(0);
    }
  });
});

describe('session routes', () => {
  it('defaults to a group-wide Group Insurance session with no cookie', async () => {
    const app = server();
    const response = await app.request('/api/session');
    expect(response.status).toBe(200);

    const body = (await response.json()) as SessionResponse;
    expect(body.role).toBe('Group Insurance');
    expect(body.entityId).toBeNull();
    expect(body.scope.kind).toBe('group');
    expect(body.scope.entityCount).toBe(portfolio.entities.length);
    expect(body.scope.entityIds).toEqual(portfolio.entities.map((entity) => entity.id));
    expect(body.roles).toEqual(ROLES);
  });

  it('reports the scoped entity count after switching to an Entity Champion', async () => {
    const app = server();
    const cookie = await switchTo(app, 'Entity Champion');

    const response = await app.request('/api/session', { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);

    const body = (await response.json()) as SessionResponse;
    expect(body.role).toBe('Entity Champion');
    expect(body.entityId).toBe(DEFAULT_CHAMPION_ENTITY_ID);
    expect(body.scope.kind).toBe('entity');
    expect(body.scope.entityCount).toBe(1);
    expect(body.scope.entityIds).toEqual([DEFAULT_CHAMPION_ENTITY_ID]);
  });

  it('falls back to the group session when the cookie signature does not verify', async () => {
    const app = server();
    const cookie = await switchTo(app, 'Entity Champion');

    const separator = cookie.indexOf('=');
    const name = cookie.slice(0, separator);
    const token = cookie.slice(separator + 1);
    const tampered = `${name}=${token.slice(0, -4)}AAAA`;

    const response = await app.request('/api/session', { headers: { Cookie: tampered } });
    expect(response.status).toBe(200);

    const body = (await response.json()) as SessionResponse;
    expect(body.role).toBe('Group Insurance');
    expect(body.scope.kind).toBe('group');
    expect(body.scope.entityCount).toBe(portfolio.entities.length);
  });

  it('narrows the scoped portfolio and the group denominators stay put', async () => {
    const app = server();

    const groupResponse = await app.request('/api/session/portfolio');
    expect(groupResponse.status).toBe(200);
    const group = (await groupResponse.json()) as ScopedPortfolioResponse;
    expect(group.entityCount).toBe(portfolio.entities.length);
    expect(group.siteCount).toBe(portfolio.sites.length);
    expect(group.policyCount).toBe(portfolio.policies.length);

    const cookie = await switchTo(app, 'Entity Champion');
    const championResponse = await app.request('/api/session/portfolio', {
      headers: { Cookie: cookie },
    });
    expect(championResponse.status).toBe(200);
    const champion = (await championResponse.json()) as ScopedPortfolioResponse;

    expect(champion.role).toBe('Entity Champion');
    expect(champion.entityCount).toBe(1);
    expect(champion.group.entityCount).toBe(portfolio.entities.length);
    expect(champion.group.siteCount).toBe(portfolio.sites.length);
    expect(champion.policyCount).toBeLessThan(group.policyCount);
  });

  it('resets to Group Insurance', async () => {
    const app = server();
    const cookie = await switchTo(app, 'Entity Champion');

    const response = await app.request('/api/session/reset', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as SessionResponse;
    expect(body.role).toBe('Group Insurance');
    expect(body.entityId).toBeNull();
    expect(body.scope.kind).toBe('group');
    expect(body.scope.entityCount).toBe(portfolio.entities.length);
  });

  it('rejects an unknown role', async () => {
    const app = server();
    const response = await app.request('/api/session/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Admin' }),
    });
    expect(response.status).toBe(400);
  });
});

describe('isInScope', () => {
  const champion = { kind: 'entity' as const, entityId: 'ent-01', entityName: 'E1', entityIds: ['ent-01'], entityCount: 1 };
  const empty = { kind: 'entity' as const, entityId: 'ent-99', entityName: null, entityIds: [], entityCount: 0 };
  const group = { kind: 'group' as const, entityId: null, entityName: null, entityIds: ['ent-01', 'ent-02'], entityCount: 2 };

  it('lets a group scope see every row, including unowned ones', () => {
    expect(isInScope(group, null)).toBe(true);
    expect(isInScope(group, 'ent-01')).toBe(true);
    expect(isInScope(group, 'ent-02')).toBe(true);
  });

  it('lets an entity scope see its own rows only, never unowned rows', () => {
    expect(isInScope(champion, 'ent-01')).toBe(true);
    expect(isInScope(champion, 'ent-02')).toBe(false);
    expect(isInScope(champion, null)).toBe(false);
  });

  it('denies everything to an entity scope with no valid entity', () => {
    expect(isInScope(empty, 'ent-99')).toBe(false);
    expect(isInScope(empty, null)).toBe(false);
  });
});

describe('CSV export', () => {
  it('quotes commas, quotes and line breaks per RFC 4180', () => {
    const csv = toCsv(
      ['name', 'note'],
      [
        ['plain', 'no quoting'],
        ['comma', 'a,b'],
        ['quote', 'he said "hi"'],
        ['newline', 'line one\nline two'],
      ],
    );

    expect(csv).toBe(
      'name,note\r\n' +
        'plain,no quoting\r\n' +
        'comma,"a,b"\r\n' +
        'quote,"he said ""hi"""\r\n' +
        'newline,"line one\nline two"\r\n',
    );
  });

  it("exports only a champion's policies, with the required headers", async () => {
    const app = server();
    const cookie = await switchTo(app, 'Entity Champion');

    const response = await app.request('/api/export/policies.csv', {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="salus-policies.csv"',
    );

    const text = await response.text();
    const lines = text.trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'entity_id,entity_name,policy_id,policy_no,line,carrier,broker,inception,expiry,currency,status',
    );

    const rows = lines.slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.startsWith(`${DEFAULT_CHAMPION_ENTITY_ID},`))).toBe(true);

    const ownPolicyNumbers = portfolio.policies
      .filter((policy) => policy.entityId === DEFAULT_CHAMPION_ENTITY_ID)
      .map((policy) => policy.policyNo);
    for (const policyNo of ownPolicyNumbers) {
      expect(text).toContain(policyNo);
    }

    const otherPolicyNumbers = portfolio.policies
      .filter((policy) => policy.entityId !== DEFAULT_CHAMPION_ENTITY_ID)
      .map((policy) => policy.policyNo);
    expect(otherPolicyNumbers.length).toBeGreaterThan(0);
    for (const policyNo of otherPolicyNumbers) {
      expect(text).not.toContain(policyNo);
    }

    const requirements = await app.request('/api/export/requirements.csv', {
      headers: { Cookie: cookie },
    });
    const requirementRows = (await requirements.text()).trimEnd().split('\r\n').slice(1);
    expect(requirementRows.length).toBeGreaterThan(0);
    expect(requirementRows.every((row) => row.startsWith(`${DEFAULT_CHAMPION_ENTITY_ID},`))).toBe(
      true,
    );
  });

  it('exports the full book when there is no session cookie', async () => {
    const app = server();
    const response = await app.request('/api/export/policies.csv');
    expect(response.status).toBe(200);

    const text = await response.text();
    const other = portfolio.policies.find(
      (policy) => policy.entityId !== DEFAULT_CHAMPION_ENTITY_ID,
    );
    expect(other).toBeDefined();
    expect(text).toContain(other?.policyNo ?? '');
    expect(text.trimEnd().split('\r\n')).toHaveLength(portfolio.policies.length + 1);
  });

  it('writes numbers without thousands separators', async () => {
    const app = server();
    const response = await app.request('/api/export/requirements.csv');
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toContain(',25000000,SGD');
    expect(text).not.toContain('25,000,000');
  });

  it('quotes an exclusion wording excerpt that contains a comma', async () => {
    const app = server();
    const response = await app.request('/api/export/exclusions.csv');
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toContain(
      '"Loss or damage caused by flood, surface water or overflow from watercourses is excluded."',
    );
  });

  it('404s an unknown export name', async () => {
    const app = server();
    const response = await app.request('/api/export/sites.csv');
    expect(response.status).toBe(404);
  });
});
