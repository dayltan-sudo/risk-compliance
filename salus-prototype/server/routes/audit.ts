import { Hono } from 'hono';
import { z } from 'zod';

import { countAudit, listAudit } from '../../src/audit/store';
import { AUDIT_OBJECT_TYPES, type AuditListResponse } from '../../src/audit/types';

/**
 * P7 audit route.
 *
 * Mount this sub-app at the root: it owns the full `/api/audit` prefix. The
 * store is append-only, so there is deliberately no POST, PATCH or DELETE
 * here. Anything that changes a record calls `recordAudit` itself; this
 * endpoint only reads.
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

export const auditRoutes = new Hono();

auditRoutes.get('/api/audit', (c) => {
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
  const events = listAudit({
    ...(objectType === undefined ? {} : { objectType }),
    ...(limit === undefined ? {} : { limit }),
  });

  const body: AuditListResponse = {
    count: events.length,
    total: countAudit(),
    objectType: objectType ?? null,
    events,
  };

  return c.json(body);
});
