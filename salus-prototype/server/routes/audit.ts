import { Hono } from 'hono';
import { z } from 'zod';

import {
  AUDIT_DEFAULT_LIMIT,
  AUDIT_MAX_LIMIT,
  countAudit,
  listAudit,
} from '../../src/audit/store';
import { AUDIT_OBJECT_TYPES } from '../../src/audit/types';
import { portfolio } from '../../src/data/portfolio';
import { auditEntityId, type OwnedAuditEvent } from '../middleware/audit-scope';
import { isInScope, scopeFor } from '../middleware/scope';
import { readSession } from './session';

/**
 * P7 audit route.
 *
 * Mount this sub-app at the root: it owns the full `/api/audit` prefix. The
 * store is append-only, so there is deliberately no POST, PATCH or DELETE
 * here. Anything that changes a record calls `recordAudit` itself; this
 * endpoint only reads.
 *
 * Scope: each event carries the entity that owns it, and a session sees only
 * events for its own entity. Unowned events (session, config) are group-only.
 */

const auditQuerySchema = z.object({
  /** Exact object family; omit for every family. */
  objectType: z.enum(AUDIT_OBJECT_TYPES).optional(),
  /**
   * Cap on returned events. The store clamps the upper bound, so a caller
   * asking for more than `AUDIT_MAX_LIMIT` gets the maximum rather than an
   * error. A negative or fractional value is nonsense and rejected here.
   */
  limit: z.coerce.number().int().min(0).optional(),
});

/** `AuditListResponse`, with each event carrying its owning entity. */
export type ScopedAuditListResponse = {
  count: number;
  /**
   * Group sessions: every event in the log. Entity sessions: the in-scope
   * events in the readable window, since the log is not counted per entity.
   */
  total: number;
  objectType: string | null;
  events: OwnedAuditEvent[];
};

export const auditRoutes = new Hono();

auditRoutes.get('/api/audit', async (c) => {
  const parsed = auditQuerySchema.safeParse({
    objectType: c.req.query('objectType'),
    limit: c.req.query('limit'),
  });

  if (!parsed.success) {
    return c.json(
      {
        error: `invalid audit query; objectType must be one of ${AUDIT_OBJECT_TYPES.join(', ')} and limit a non-negative integer`,
        issues: parsed.error.issues,
      },
      400,
    );
  }

  const { objectType, limit } = parsed.data;
  const session = await readSession(c);
  const scope = scopeFor(portfolio, session);

  // Scope is applied before the limit, so a cap cannot hide an in-scope event
  // behind out-of-scope ones. The store reads at most AUDIT_MAX_LIMIT events.
  const visible = listAudit({
    ...(objectType === undefined ? {} : { objectType }),
    limit: AUDIT_MAX_LIMIT,
  })
    .map((event): OwnedAuditEvent => ({ ...event, entityId: auditEntityId(portfolio, event) }))
    .filter((event) => isInScope(scope, event.entityId));

  const events = visible.slice(0, Math.min(limit ?? AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT));

  const body: ScopedAuditListResponse = {
    count: events.length,
    total: scope.kind === 'group' ? countAudit() : visible.length,
    objectType: objectType ?? null,
    events,
  };

  return c.json(body);
});
