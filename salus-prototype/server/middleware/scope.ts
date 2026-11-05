/**
 * Server-side role scoping.
 *
 * The rule is deliberately narrow: an `Entity Champion` sees exactly one
 * entity; every other role sees the group. Scoping returns a filtered copy of
 * the portfolio rather than a predicate so that a route cannot forget to apply
 * it: pass the result to the engine and the numbers follow.
 *
 * Deny by default. A champion with no assignment, or with an entity id that is
 * not in the portfolio, gets an empty book, never the group.
 */
import type { Portfolio } from '../../src/engine/types';
import type { Session, SessionScope } from '../../src/audit/types';

function groupScope(portfolio: Portfolio): SessionScope {
  const entityIds = portfolio.entities.map((entity) => entity.id);
  return {
    kind: 'group',
    entityId: null,
    entityName: null,
    entityIds,
    entityCount: entityIds.length,
  };
}

/** Human-readable description of what the session can see. */
export function scopeFor(portfolio: Portfolio, session: Session): SessionScope {
  if (session.role !== 'Entity Champion') return groupScope(portfolio);

  const entity =
    session.entityId === null
      ? undefined
      : portfolio.entities.find((candidate) => candidate.id === session.entityId);

  if (entity === undefined) {
    return {
      kind: 'entity',
      entityId: session.entityId,
      entityName: null,
      entityIds: [],
      entityCount: 0,
    };
  }

  return {
    kind: 'entity',
    entityId: entity.id,
    entityName: entity.name,
    entityIds: [entity.id],
    entityCount: 1,
  };
}

/**
 * Whether a row owned by `entityId` (null means group-wide or unowned) is
 * visible to a session with this scope. Group sees everything, unowned rows
 * included. An entity session sees only rows owned by one of its entities, so
 * an unowned row is group-only.
 */
export function isInScope(scope: SessionScope, entityId: string | null): boolean {
  if (scope.kind === 'group') return true;
  return entityId !== null && scope.entityIds.includes(entityId);
}

function emptyBook(portfolio: Portfolio): Portfolio {
  return {
    ...portfolio,
    entities: [],
    sites: [],
    assets: [],
    policies: [],
    coverages: [],
    premiums: [],
    requirements: [],
    exclusions: [],
  };
}

/**
 * The portfolio the session is allowed to see. Group roles get the seed object
 * itself (no copy, nothing to filter); an entity champion gets copies of every
 * row list, filtered to their sites and policies.
 */
export function scopedPortfolio(portfolio: Portfolio, session: Session): Portfolio {
  if (session.role !== 'Entity Champion') return portfolio;

  const entity =
    session.entityId === null
      ? undefined
      : portfolio.entities.find((candidate) => candidate.id === session.entityId);

  if (entity === undefined) return emptyBook(portfolio);

  const sites = portfolio.sites.filter((site) => site.entityId === entity.id);
  const siteIds = new Set(sites.map((site) => site.id));
  const policies = portfolio.policies.filter((policy) => policy.entityId === entity.id);
  const policyIds = new Set(policies.map((policy) => policy.id));

  return {
    ...portfolio,
    entities: [entity],
    sites,
    assets: portfolio.assets.filter((asset) => siteIds.has(asset.siteId)),
    policies,
    coverages: portfolio.coverages.filter((coverage) => siteIds.has(coverage.siteId)),
    premiums: portfolio.premiums.filter((premium) => policyIds.has(premium.policyId)),
    requirements: portfolio.requirements.filter((requirement) => siteIds.has(requirement.siteId)),
    exclusions: portfolio.exclusions.filter((exclusion) => siteIds.has(exclusion.siteId)),
  };
}
