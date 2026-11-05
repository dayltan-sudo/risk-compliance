import {
  coverageLimitSgd,
  daysBetween,
  findExclusionOverride,
  requirementStatus,
} from '../../engine';
import type { Band, Portfolio, Site } from '../../engine';
import type { ScoredSite } from '../layout/filters';
import { formatDate, formatMoneyCompact, formatPct } from './format';

export type ExceptionKind = 'Requirement gap' | 'Excluded cover' | 'Renewal' | 'Under-insured';

export interface ExceptionRow {
  id: string;
  kind: ExceptionKind;
  title: string;
  siteId: string;
  siteName: string;
  entityName: string;
  severity: Band;
  detail: string;
  /** Short line for the action rail. */
  meta: string;
  valueSgd: number;
  /** Deep link to the record that caused the exception, not to the site's map pin. */
  href: string;
  /**
   * `record` links go straight to the page that owns the row, so they are kept
   * bare: a hash link is only useful if the anchored row is definitely rendered,
   * which a filtered page cannot promise. `map` links are the fallback for rows
   * with no page of their own, and callers may add the current filter scope.
   */
  target: 'record' | 'map';
}

/** Singular and plural nouns for the one-line breakdown under the table. */
const KIND_NOUN: Record<ExceptionKind, readonly [string, string]> = {
  'Requirement gap': ['requirement gap', 'requirement gaps'],
  'Excluded cover': ['exclusion', 'exclusions'],
  Renewal: ['renewal', 'renewals'],
  'Under-insured': ['under-insured site', 'under-insured sites'],
};

/**
 * "4 requirement gaps + 3 exclusions + 2 renewals + 4 under-insured sites",
 * counted from the same rows the table and rail render. Empty set gives ''.
 */
export function describeExceptions(rows: readonly ExceptionRow[]): string {
  const counts = new Map<ExceptionKind, number>();
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);

  return (Object.keys(KIND_NOUN) as ExceptionKind[])
    .filter((kind) => (counts.get(kind) ?? 0) > 0)
    .map((kind) => {
      const count = counts.get(kind) ?? 0;
      const [one, many] = KIND_NOUN[kind];
      return `${count} ${count === 1 ? one : many}`;
    })
    .join(' + ');
}

const BAND_RANK: Record<Band, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const KIND_RANK: Record<ExceptionKind, number> = {
  'Requirement gap': 0,
  'Excluded cover': 1,
  Renewal: 2,
  'Under-insured': 3,
};

/**
 * One queue for the exception table and the action rail. Everything here is an
 * engine result or a portfolio record: requirement assessments, renewal dates
 * and site-level ITV. No counts or thresholds are invented locally.
 */
export function buildExceptions(
  portfolio: Portfolio,
  sites: readonly ScoredSite[],
): ExceptionRow[] {
  const asOf = portfolio.config.effectiveFrom;
  const siteById = new Map<string, Site>(portfolio.sites.map((site) => [site.id, site]));
  const entityNameById = new Map(portfolio.entities.map((entity) => [entity.id, entity.name]));
  const carrierNameById = new Map(portfolio.carriers.map((carrier) => [carrier.id, carrier.name]));
  const rows: ExceptionRow[] = [];

  const entityName = (site: Site): string => entityNameById.get(site.entityId) ?? site.entityId;

  for (const requirement of portfolio.requirements) {
    const assessment = requirementStatus(requirement, portfolio, asOf);
    if (assessment.status !== 'Gap' && assessment.status !== 'Excluded') continue;
    const site = siteById.get(requirement.siteId);
    if (site === undefined) continue;

    const placedPct = assessment.requiredSgd > 0 ? (assessment.placedSgd / assessment.requiredSgd) * 100 : 0;
    const isGap = assessment.status === 'Gap';
    const shortfall = Math.max(0, assessment.requiredSgd - assessment.placedSgd);
    // Null for a plain gap: an override would have made the status Excluded.
    const override = isGap ? null : findExclusionOverride(requirement, assessment.requiredSgd, portfolio, asOf);

    rows.push({
      id: `requirement-${requirement.id}`,
      kind: isGap ? 'Requirement gap' : 'Excluded cover',
      title: isGap
        ? `${site.name}: ${requirement.line} ${formatPct(placedPct, 0)} placed`
        : `${site.name}: ${requirement.peril} cover excluded`,
      siteId: site.id,
      siteName: site.name,
      entityName: entityName(site),
      severity: isGap ? 'Critical' : 'High',
      detail: isGap
        ? `${requirement.counterparty} requires ${formatMoneyCompact(assessment.requiredSgd)}; placed ${formatMoneyCompact(assessment.placedSgd)}.`
        : (assessment.note ?? `${requirement.line} requirement is overridden by an exclusion.`),
      meta: `${site.name} · ${requirement.clauseRef}`,
      valueSgd: isGap ? shortfall : assessment.requiredSgd,
      href:
        override === null
          ? `/contracts#${requirement.id}`
          : `/exclusions#${override.exclusion.id}`,
      target: 'record',
    });
  }

  for (const policy of portfolio.policies) {
    if (policy.status !== 'Active') continue;
    const days = daysBetween(asOf, policy.expiry);
    if (days <= 0 || days > 60) continue;

    const coverages = portfolio.coverages.filter((coverage) => coverage.policyId === policy.id);
    let site: Site | undefined;
    for (const coverage of coverages) {
      const candidate = siteById.get(coverage.siteId);
      if (candidate !== undefined) {
        site = candidate;
        break;
      }
    }
    if (site === undefined) continue;

    const limitSgd = coverages.reduce(
      (total, coverage) => total + coverageLimitSgd(coverage, portfolio, asOf),
      0,
    );
    const carrier = carrierNameById.get(policy.carrierId) ?? policy.carrierId;

    rows.push({
      id: `renewal-${policy.id}`,
      kind: 'Renewal',
      title: `${policy.policyNo} renews in ${days} day${days === 1 ? '' : 's'}`,
      siteId: site.id,
      siteName: site.name,
      entityName: entityName(site),
      severity: days <= 30 ? 'Critical' : 'High',
      detail: `${policy.line} · ${carrier} · expires ${formatDate(policy.expiry)}.`,
      meta: `${site.name} · ${days}d`,
      valueSgd: limitSgd,
      // No renewal page yet, so the map's site focus is the best available target.
      href: `/map?site=${site.id}`,
      target: 'map',
    });
  }

  for (const entry of sites) {
    if (!entry.underInsured) continue;
    rows.push({
      id: `under-insured-${entry.site.id}`,
      kind: 'Under-insured',
      title: `${entry.site.name} is ${formatPct(entry.tivCoverRatio * 100, 0)} insured to value`,
      siteId: entry.site.id,
      siteName: entry.site.name,
      entityName: entityName(entry.site),
      severity: entry.band,
      detail: `TIV ${formatMoneyCompact(entry.site.tivSgd)}; property cover ${formatMoneyCompact(entry.coverSgd)}.`,
      meta: `${entry.site.name} · ITV ${formatPct(entry.tivCoverRatio * 100, 0)}`,
      valueSgd: Math.max(0, entry.site.tivSgd - entry.coverSgd),
      // `/coverage#<site id>` is not wired: the Coverage page renders no element
      // carrying a site id, so the hash would land on the page top with no
      // highlight. The map's site focus is the only surface that can point at one
      // site, so it stays the target until Coverage grows per-site anchors.
      href: `/map?site=${entry.site.id}`,
      target: 'map',
    });
  }

  rows.sort((a, b) => {
    const bySeverity = BAND_RANK[a.severity] - BAND_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;
    return b.valueSgd - a.valueSgd;
  });

  return rows;
}
