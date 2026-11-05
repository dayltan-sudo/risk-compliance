/**
 * Types for the P7 governance layer: the audit trail and the demo's role
 * sessions.
 *
 * Audit events are records, not domain objects: the fields are deliberately
 * untyped (`unknown` before/after) because the same log carries policy,
 * coverage, requirement, exclusion, config and session changes.
 *
 * Nothing here may be persisted. The store is in-memory and resets on restart;
 * the prototype is a demo, not a system of record.
 */

/* ------------------------------------------------------------------- audit */

/** Object families the audit log knows about. */
export const AUDIT_OBJECT_TYPES = [
  'policy',
  'coverage',
  'requirement',
  'exclusion',
  'config',
  'session',
] as const;

export type AuditObjectType = (typeof AUDIT_OBJECT_TYPES)[number];

export type AuditEvent = {
  /** Stable, human-quotable identifier, e.g. `aud-0009`. */
  id: string;
  /** Instant the event was recorded, ISO 8601 with time. */
  at: string;
  /** Invented person plus function, e.g. `Priya Raman (R&C Manager)`. */
  actor: string;
  /** Dotted verb, e.g. `coverage.versioned`. */
  action: string;
  objectType: string;
  objectId: string;
  before: unknown;
  after: unknown;
};

/** `recordAudit` input: the store owns `id`, and defaults `at` to now. */
export type AuditEventInput = Omit<AuditEvent, 'id' | 'at'> & { at?: string };

export type AuditQuery = {
  /** Exact match on `objectType`; omit for every family. */
  objectType?: string;
  /** Newest-first cap. Defaults to 100, capped at 500. */
  limit?: number;
};

export type AuditListResponse = {
  /** Events after filtering and the limit. */
  count: number;
  /** Events in the store, before filtering. */
  total: number;
  objectType: string | null;
  events: AuditEvent[];
};

/* ----------------------------------------------------------------- session */

/** The four demo roles. Order is the order the switcher renders. */
export const ROLES = ['Group Insurance', 'R&C Manager', 'Entity Champion', 'Auditor'] as const;

export type Role = (typeof ROLES)[number];

/** An Entity Champion with no explicit assignment gets this entity. */
export const DEFAULT_CHAMPION_ENTITY_ID = 'ent-01';

/**
 * The server-side session. `entityId` is set only for an Entity Champion; every
 * other role is group-wide by design.
 */
export type Session = {
  role: Role;
  entityId: string | null;
};

/**
 * Derived scope. `entityIds` is always explicit so a caller never has to
 * re-derive "group means all" and accidentally treat an empty list as "group".
 */
export type SessionScope = {
  kind: 'group' | 'entity';
  entityId: string | null;
  entityName: string | null;
  entityIds: string[];
  entityCount: number;
};

export type SessionResponse = {
  role: Role;
  entityId: string | null;
  scope: SessionScope;
  roles: readonly Role[];
};

export type ScopedPortfolioResponse = {
  role: Role;
  scope: SessionScope;
  asOf: string;
  entityCount: number;
  siteCount: number;
  policyCount: number;
  requirementCount: number;
  /** Group totals, so the UI can say "3 of 14 sites" without hard-coding. */
  group: { entityCount: number; siteCount: number };
  summary: {
    tivSgd: number;
    insuredSgd: number;
    adequacyPct: number;
    openGaps: number;
    atRisk: number;
    excluded: number;
    requirementCounts: Record<string, number> & { total: number };
  };
};
