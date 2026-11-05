/**
 * In-memory, append-only audit store.
 *
 * There is deliberately no update and no delete: `recordAudit` is the only
 * mutation, and `listAudit` hands back frozen records so a caller cannot edit
 * history through a returned reference. The list resets when the process
 * restarts, which is the correct behaviour for a demo and would not be for a
 * system of record.
 *
 * The eight seed events are fabricated history over the synthetic portfolio.
 * They exist so the audit view is populated on first load; no real Keppel
 * record, actor or figure is represented.
 */
import type { AuditEvent, AuditEventInput, AuditQuery } from './types';

export const AUDIT_DEFAULT_LIMIT = 100;
export const AUDIT_MAX_LIMIT = 500;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function makeEvent(event: AuditEvent): AuditEvent {
  return deepFreeze({ ...event });
}

/** Ascending by `at`. `listAudit` reverses, so newest recorded is first. */
const SEED: readonly AuditEvent[] = [
  {
    id: 'aud-0001',
    at: '2026-10-06T01:12:00.000Z',
    actor: 'Priya Raman (R&C Manager)',
    action: 'config.published',
    objectType: 'config',
    objectId: 'cfg-2026-10',
    before: { itvUnder: 0.85, atRiskTolerance: 0.08 },
    after: { itvUnder: 0.9, atRiskTolerance: 0.1 },
  },
  {
    id: 'aud-0002',
    at: '2026-10-13T06:40:00.000Z',
    actor: 'Wei Ling Chua (Entity Champion)',
    action: 'coverage.versioned',
    objectType: 'coverage',
    objectId: 'cov-04',
    before: { version: 1, limitOcc: 410_000_000 },
    after: { version: 2, limitOcc: 435_000_000 },
  },
  {
    id: 'aud-0003',
    at: '2026-10-16T02:05:00.000Z',
    actor: 'Marcus Tan (Group Insurance)',
    action: 'policy.status_changed',
    objectType: 'policy',
    objectId: 'pol-15',
    before: { status: 'Active' },
    after: { status: 'Expired' },
  },
  {
    id: 'aud-0004',
    at: '2026-10-20T08:22:00.000Z',
    actor: 'Daniel Okoye (Broker Ops)',
    action: 'requirement.imported',
    objectType: 'requirement',
    objectId: 'req-06',
    before: null,
    after: {
      counterparty: 'Merlion Cloud Services Pte Ltd',
      clauseRef: 'Cl. 8.4',
      requiredLimit: 30_000_000,
    },
  },
  {
    id: 'aud-0005',
    at: '2026-10-23T03:48:00.000Z',
    actor: 'Priya Raman (R&C Manager)',
    action: 'exclusion.recorded',
    objectType: 'exclusion',
    objectId: 'exc-11',
    before: null,
    after: { scope: 'full', peril: 'Ransomware', clauseRef: 'EXC-CY-44' },
  },
  {
    id: 'aud-0006',
    at: '2026-10-28T01:31:00.000Z',
    actor: 'Aisha Karim (Group Insurance)',
    action: 'policy.renewal_opened',
    objectType: 'policy',
    objectId: 'pol-07',
    before: { expiry: '2026-11-30', renewalStatus: 'Not started' },
    after: { expiry: '2026-11-30', renewalStatus: 'In negotiation' },
  },
  {
    id: 'aud-0007',
    at: '2026-11-02T07:10:00.000Z',
    actor: 'Marcus Tan (Group Insurance)',
    action: 'requirement.reviewed',
    objectType: 'requirement',
    objectId: 'req-03',
    before: { requiredLimit: 150_000_000, placedLimit: 150_000_000, status: 'Met' },
    after: { requiredLimit: 150_000_000, placedLimit: 138_000_000, status: 'At-risk' },
  },
  {
    id: 'aud-0009',
    at: '2026-10-29T04:10:00.000Z',
    actor: 'Wei Ling Chua (Entity Champion)',
    action: 'coverage.versioned',
    objectType: 'coverage',
    objectId: 'cov-01',
    before: { version: 1, limitOcc: 480_000_000 },
    after: { version: 2, limitOcc: 500_000_000 },
  },
  {
    id: 'aud-0010',
    at: '2026-11-02T02:55:00.000Z',
    actor: 'Wei Ling Chua (Entity Champion)',
    action: 'requirement.reviewed',
    objectType: 'requirement',
    objectId: 'req-05',
    before: { status: 'At-risk' },
    after: { status: 'Met' },
  },
  {
    id: 'aud-0008',
    at: '2026-11-04T09:02:00.000Z',
    actor: 'Wei Ling Chua (Entity Champion)',
    action: 'session.role_changed',
    objectType: 'session',
    objectId: 'sess-demo',
    before: { role: 'Group Insurance' },
    after: { role: 'Entity Champion', entityId: 'ent-02' },
  },
];

const events: AuditEvent[] = SEED.map(makeEvent);
let sequence = SEED.length + 1;

/**
 * Append one event and return the stored (frozen) record. `id` and `at` are
 * assigned here so a caller cannot rewrite history by supplying its own.
 */
export function recordAudit(input: AuditEventInput): AuditEvent {
  const event = makeEvent({
    id: `aud-${String(sequence).padStart(4, '0')}`,
    at: input.at ?? new Date().toISOString(),
    actor: input.actor,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    before: input.before ?? null,
    after: input.after ?? null,
  });
  sequence += 1;
  events.push(event);
  return event;
}

/**
 * Newest-recorded first. `limit` is clamped, never throws: a nonsense limit
 * from the query string is rejected at the route, not here.
 */
export function listAudit(query: AuditQuery = {}): AuditEvent[] {
  const requested = query.limit;
  const limit =
    requested === undefined || !Number.isFinite(requested)
      ? AUDIT_DEFAULT_LIMIT
      : Math.min(Math.max(Math.floor(requested), 0), AUDIT_MAX_LIMIT);

  // Newest first by timestamp, not by arrival. Seeded history is written in
  // array order, and a seed row inserted out of sequence used to surface in the
  // wrong place while the page claimed "Newest first". Arrival order is the
  // tiebreak: two events recorded inside the same millisecond must still read
  // newest-recorded first.
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) =>
      a.event.at < b.event.at ? 1 : a.event.at > b.event.at ? -1 : b.index - a.index,
    )
    .map((entry) => entry.event);

  const result: AuditEvent[] = [];
  for (const event of ordered) {
    if (result.length >= limit) break;
    if (query.objectType !== undefined && event.objectType !== query.objectType) continue;
    result.push(event);
  }
  return result;
}

/** Size of the whole log, ignoring any filter. */
export function countAudit(): number {
  return events.length;
}
