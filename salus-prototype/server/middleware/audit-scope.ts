/**
 * Entity ownership for audit events.
 *
 * The audit store (src/audit/store.ts) keeps no owner, and its event shape is
 * outside this change. So the owner lives here, keyed by event id:
 *
 * - an event written through `recordScopedAudit` carries the owner it was
 *   recorded with (null is an explicit group-wide event);
 * - any other event (seed history, session and config changes) is resolved
 *   from the object it points at. An object that belongs to no entity, or no
 *   longer exists in the portfolio, is group-only.
 */
import { recordAudit } from '../../src/audit/store';
import type { AuditEvent, AuditEventInput } from '../../src/audit/types';
import type { Portfolio } from '../../src/engine/types';

export type OwnedAuditEvent = AuditEvent & { entityId: string | null };

const recordedOwners = new Map<string, string | null>();

/** `recordAudit` plus the owning entity, or null for a group-wide event. */
export function recordScopedAudit(input: AuditEventInput, entityId: string | null): AuditEvent {
  const event = recordAudit(input);
  recordedOwners.set(event.id, entityId);
  return event;
}

function siteEntity(portfolio: Portfolio, siteId: string): string | null {
  return portfolio.sites.find((site) => site.id === siteId)?.entityId ?? null;
}

function entityOfObject(portfolio: Portfolio, objectType: string, objectId: string): string | null {
  switch (objectType) {
    case 'policy':
      return portfolio.policies.find((policy) => policy.id === objectId)?.entityId ?? null;
    case 'coverage': {
      const coverage = portfolio.coverages.find((candidate) => candidate.id === objectId);
      return coverage === undefined ? null : siteEntity(portfolio, coverage.siteId);
    }
    case 'requirement': {
      const requirement = portfolio.requirements.find((candidate) => candidate.id === objectId);
      return requirement === undefined ? null : siteEntity(portfolio, requirement.siteId);
    }
    case 'exclusion': {
      const exclusion = portfolio.exclusions.find((candidate) => candidate.id === objectId);
      return exclusion === undefined ? null : siteEntity(portfolio, exclusion.siteId);
    }
    default:
      return null;
  }
}

/** The entity that owns an event, or null when it is group-wide. */
export function auditEntityId(portfolio: Portfolio, event: AuditEvent): string | null {
  if (recordedOwners.has(event.id)) return recordedOwners.get(event.id) ?? null;
  return entityOfObject(portfolio, event.objectType, event.objectId);
}
