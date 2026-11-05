import { randomBytes } from 'node:crypto';

import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

import { recordAudit } from '../../src/audit/store';
import {
  DEFAULT_CHAMPION_ENTITY_ID,
  ROLES,
  type Role,
  type ScopedPortfolioResponse,
  type Session,
  type SessionResponse,
} from '../../src/audit/types';
import { portfolio } from '../../src/data/portfolio';
import { groupSummary } from '../../src/engine/summary';
import { scopeFor, scopedPortfolio } from '../middleware/scope';

/**
 * P7 session routes.
 *
 * Mount this sub-app at the root: it owns the full `/api/session` prefix. The
 * session is a signed JWT in an HttpOnly cookie, not server state, so a
 * restart cannot resurrect a role and a client cannot pick its own scope by
 * editing the cookie.
 *
 * The role switcher is a demo affordance, not authentication: every request
 * is still scoped server-side by `scopeFor` / `scopedPortfolio`, and the
 * export route reads the same session.
 */

export const SESSION_COOKIE_NAME = 'salus_session';

const ALGORITHM = 'HS256';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

/**
 * Read the operator's secret directly. jose accepts a key of any length for
 * HS256, and using the bytes as configured means the JWT can be verified
 * independently with the same `SESSION_SECRET` value.
 */
function signingKey(): Uint8Array {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured !== undefined && configured !== '') {
    return new TextEncoder().encode(configured);
  }

  console.warn(
    'SESSION_SECRET is not set; using an ephemeral HS256 key. Sessions will not survive a restart.',
  );
  return new Uint8Array(randomBytes(32));
}

/** Generated once per process when no secret is configured. */
const secret = signingKey();

export const DEFAULT_SESSION: Session = { role: 'Group Insurance', entityId: null };

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

function sessionForRole(role: Role): Session {
  return {
    role,
    // Only an Entity Champion is scoped to an entity. The demo has no
    // user-to-entity assignment UI, so the documented default applies.
    entityId: role === 'Entity Champion' ? DEFAULT_CHAMPION_ENTITY_ID : null,
  };
}

async function signSession(session: Session): Promise<string> {
  return new SignJWT({ role: session.role, entityId: session.entityId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(secret);
}

/**
 * Read the session from the request cookie. A missing, expired, tampered or
 * malformed cookie falls back to the documented demo baseline: Group
 * Insurance, group-wide. There is no login step, so a bad token is treated
 * like a first visit; tampering cannot select a different role or entity
 * because the signature is verified first.
 */
export async function readSession(c: Context): Promise<Session> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token === undefined) return DEFAULT_SESSION;

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALGORITHM] });
    const role = payload['role'];
    if (!isRole(role)) return DEFAULT_SESSION;

    if (role !== 'Entity Champion') return { role, entityId: null };

    const entityId = payload['entityId'];
    return {
      role,
      entityId:
        typeof entityId === 'string' && entityId !== '' ? entityId : DEFAULT_CHAMPION_ENTITY_ID,
    };
  } catch {
    return DEFAULT_SESSION;
  }
}

function toSessionResponse(session: Session): SessionResponse {
  return {
    role: session.role,
    entityId: session.entityId,
    scope: scopeFor(portfolio, session),
    roles: ROLES,
  };
}

async function writeSession(c: Context, session: Session): Promise<Response> {
  const token = await signSession(session);
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
  return c.json(toSessionResponse(session));
}

export const sessionRoutes = new Hono();

sessionRoutes.get('/api/session', async (c) => c.json(toSessionResponse(await readSession(c))));

const roleSchema = z.object({ role: z.enum(ROLES) });

sessionRoutes.post('/api/session/role', async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = roleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: `invalid request body; role must be one of ${ROLES.join(', ')}`,
        issues: parsed.error.issues,
      },
      400,
    );
  }

  const previous = await readSession(c);
  const next = sessionForRole(parsed.data.role);

  recordAudit({
    actor: 'Demo role switcher',
    action: 'session.role_changed',
    objectType: 'session',
    objectId: 'sess-demo',
    before: { role: previous.role, entityId: previous.entityId },
    after: { role: next.role, entityId: next.entityId },
  });

  return writeSession(c, next);
});

sessionRoutes.get('/api/session/portfolio', async (c) => {
  const session = await readSession(c);
  const scoped = scopedPortfolio(portfolio, session);
  const asOf = portfolio.config.effectiveFrom;
  const summary = groupSummary(scoped, asOf);

  const body: ScopedPortfolioResponse = {
    role: session.role,
    scope: scopeFor(portfolio, session),
    asOf,
    entityCount: scoped.entities.length,
    siteCount: scoped.sites.length,
    policyCount: scoped.policies.length,
    requirementCount: scoped.requirements.length,
    // Group denominators, so the UI can say "3 of 14 sites" without a
    // hard-coded constant.
    group: {
      entityCount: portfolio.entities.length,
      siteCount: portfolio.sites.length,
    },
    summary: {
      tivSgd: summary.tivSgd,
      insuredSgd: summary.insuredSgd,
      adequacyPct: summary.adequacyPct,
      openGaps: summary.openGaps,
      atRisk: summary.atRisk,
      excluded: summary.excluded,
      requirementCounts: summary.requirementCounts,
    },
  };

  return c.json(body);
});

sessionRoutes.post('/api/session/reset', async (c) => {
  const previous = await readSession(c);

  recordAudit({
    actor: 'Demo role switcher',
    action: 'session.reset',
    objectType: 'session',
    objectId: 'sess-demo',
    before: { role: previous.role, entityId: previous.entityId },
    after: { role: DEFAULT_SESSION.role, entityId: DEFAULT_SESSION.entityId },
  });

  // Write the group session explicitly rather than relying on a cleared
  // cookie: the client's next request is group-wide even if it does not
  // process a deletion.
  return writeSession(c, DEFAULT_SESSION);
});
