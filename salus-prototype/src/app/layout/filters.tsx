import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { portfolio as seedPortfolio } from '../../data/portfolio';
import { applyPostedRecords } from '../../data/overlay';
import { usePostedRecords } from './posted';
import {
  LINES,
  activeCoveragesForSite,
  addDays,
  coverageGapPct,
  exposedLinesForSite,
  groupSummary,
  requirementStatus,
  scoreSite,
  siteTivCoverSgd,
} from '../../engine';
import type {
  Band,
  DriverScore,
  Entity,
  GroupSummary,
  Line,
  Portfolio,
  Site,
} from '../../engine';

/**
 * Global filter state.
 *
 * `lines: null` means "all lines"; `lines: []` means an explicit empty
 * selection (no sites in scope). The distinction matters because a checkbox
 * list has to represent "everything" and "nothing" separately.
 */
export type RenewalWindow = 30 | 60 | 90;

export interface FilterState {
  lines: Line[] | null;
  entityId: string | null;
  renewalWindow: RenewalWindow | null;
  gapsOnly: boolean;
  highRiskOnly: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  lines: null,
  entityId: null,
  renewalWindow: null,
  gapsOnly: false,
  highRiskOnly: false,
};

const FILTER_KEYS = ['line', 'entity', 'renew', 'gaps', 'risk'] as const;

/**
 * Readable, stable URL slugs derived from the engine's own line names, so the
 * option list never drifts from `LINES`.
 */
function lineSlug(value: Line): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const LINE_BY_SLUG = new Map<string, Line>(LINES.map((line) => [lineSlug(line), line]));
const SLUG_BY_LINE = new Map<Line, string>(LINES.map((line) => [line, lineSlug(line)]));

/** Canonical order, de-duplicated. All lines checked collapses to "no filter". */
function normaliseLines(input: readonly Line[]): Line[] | null {
  const canonical = LINES.filter((line) => input.includes(line));
  return canonical.length === LINES.length ? null : canonical;
}

export function parseFilters(params: URLSearchParams): FilterState {
  const rawLine = params.get('line');
  let lines: Line[] | null = null;
  if (rawLine !== null) {
    const parsed: Line[] = [];
    for (const slug of rawLine.split(',')) {
      const line = LINE_BY_SLUG.get(slug.trim());
      if (line !== undefined && !parsed.includes(line)) parsed.push(line);
    }
    // An empty value is the bar's explicit "No lines" selection, a real scope
    // with no sites in it. Slugs that name no line come from a stale or
    // hand-edited link, so they leave the filter off the way an unknown entity
    // or renewal window does, rather than narrowing the view to nothing.
    if (rawLine.trim() === '') lines = [];
    else if (parsed.length === 0) lines = null;
    else lines = normaliseLines(parsed);
  }

  const rawEntity = params.get('entity');
  const entityId =
    rawEntity !== null && seedPortfolio.entities.some((entity) => entity.id === rawEntity)
      ? rawEntity
      : null;

  const rawRenewal = params.get('renew');
  const renewalWindow: RenewalWindow | null =
    rawRenewal === '30' ? 30 : rawRenewal === '60' ? 60 : rawRenewal === '90' ? 90 : null;

  return {
    lines,
    entityId,
    renewalWindow,
    gapsOnly: params.get('gaps') === '1',
    highRiskOnly: params.get('risk') === 'high',
  };
}

function writeFilters(params: URLSearchParams, filters: FilterState): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of FILTER_KEYS) next.delete(key);

  if (filters.lines !== null) {
    next.set(
      'line',
      filters.lines.map((line) => SLUG_BY_LINE.get(line) ?? '').filter(Boolean).join(','),
    );
  }
  if (filters.entityId !== null) next.set('entity', filters.entityId);
  if (filters.renewalWindow !== null) next.set('renew', String(filters.renewalWindow));
  if (filters.gapsOnly) next.set('gaps', '1');
  if (filters.highRiskOnly) next.set('risk', 'high');

  return next;
}

/** One site with its engine score and the numbers the list and rail show. */
export interface ScoredSite {
  site: Site;
  score: number;
  band: Band;
  drivers: DriverScore[];
  /** Property/construction limit at the site, in SGD. */
  coverSgd: number;
  /** 0..1, capped at 1 for over-insured sites via `coverageGapPct`. */
  tivCoverRatio: number;
  gapPct: number;
  underInsured: boolean;
  openRequirements: number;
}

function emptyPortfolio(source: Portfolio): Portfolio {
  return {
    entities: [],
    sites: [],
    assets: [],
    carriers: source.carriers,
    brokers: source.brokers,
    policies: [],
    coverages: [],
    premiums: [],
    requirements: [],
    exclusions: [],
    fxRates: source.fxRates,
    config: source.config,
  };
}

/**
 * Filters the portfolio at *site scope* and keeps each surviving site's full
 * insurance position. That is deliberate: slicing coverages by line would turn
 * every non-property view into a 0% adequacy figure, which says nothing about
 * the sites in scope.
 *
 * Every predicate is evaluated against the unfiltered source, so a filter can
 * never depend on the result of an earlier filter.
 */
export function filterPortfolio(source: Portfolio, filters: FilterState): Portfolio {
  const asOf = source.config.effectiveFrom;
  const cutoff = filters.renewalWindow === null ? null : addDays(asOf, filters.renewalWindow);

  const policyById = new Map(source.policies.map((policy) => [policy.id, policy]));
  const sitePolicyIds = new Map<string, Set<string>>();
  for (const coverage of source.coverages) {
    const ids = sitePolicyIds.get(coverage.siteId) ?? new Set<string>();
    ids.add(coverage.policyId);
    sitePolicyIds.set(coverage.siteId, ids);
  }

  const expiringPolicyIds = new Set<string>();
  if (cutoff !== null) {
    for (const policy of source.policies) {
      if (policy.status !== 'Active') continue;
      if (policy.expiry <= asOf || policy.expiry > cutoff) continue;
      expiringPolicyIds.add(policy.id);
    }
  }

  const requirementsBySite = new Map<string, typeof source.requirements>();
  for (const requirement of source.requirements) {
    const list = requirementsBySite.get(requirement.siteId) ?? [];
    list.push(requirement);
    requirementsBySite.set(requirement.siteId, list);
  }

  const keptSiteIds = new Set<string>();

  for (const site of source.sites) {
    if (filters.entityId !== null && site.entityId !== filters.entityId) continue;

    if (filters.lines !== null) {
      const exposed = exposedLinesForSite(site, source);
      const covered = activeCoveragesForSite(site.id, source, asOf).map(
        (coverage) => coverage.line,
      );
      const inScope = filters.lines.some(
        (line) => exposed.includes(line) || covered.includes(line),
      );
      if (!inScope) continue;
    }

    if (cutoff !== null) {
      const policyIds = sitePolicyIds.get(site.id);
      if (policyIds === undefined) continue;
      let renewing = false;
      for (const policyId of policyIds) {
        const policy = policyById.get(policyId);
        if (policy === undefined || policy.status !== 'Active') continue;
        if (expiringPolicyIds.has(policy.id)) {
          renewing = true;
          break;
        }
      }
      if (!renewing) continue;
    }

    if (filters.gapsOnly) {
      const requirements = requirementsBySite.get(site.id) ?? [];
      const hasOpen = requirements.some((requirement) => {
        const status = requirementStatus(requirement, source, asOf).status;
        return status === 'Gap' || status === 'Excluded';
      });
      if (!hasOpen) continue;
    }

    if (filters.highRiskOnly) {
      const band = scoreSite(site, source).band;
      if (band !== 'High' && band !== 'Critical') continue;
    }

    keptSiteIds.add(site.id);
  }

  if (keptSiteIds.size === 0) return emptyPortfolio(source);

  const coverages = source.coverages.filter((coverage) => keptSiteIds.has(coverage.siteId));
  const policyIds = new Set(coverages.map((coverage) => coverage.policyId));
  const policies = source.policies.filter(
    (policy) =>
      (filters.entityId === null || policy.entityId === filters.entityId) &&
      (policyIds.has(policy.id) ||
        !source.coverages.some((coverage) => coverage.policyId === policy.id)),
  );

  const siteEntityIds = new Set<string>();
  for (const site of source.sites) {
    if (keptSiteIds.has(site.id)) siteEntityIds.add(site.entityId);
  }

  return {
    entities: source.entities.filter((entity) => siteEntityIds.has(entity.id)),
    sites: source.sites.filter((site) => keptSiteIds.has(site.id)),
    assets: source.assets.filter((asset) => keptSiteIds.has(asset.siteId)),
    carriers: source.carriers,
    brokers: source.brokers,
    policies,
    coverages,
    premiums: source.premiums.filter((premium) => policyIds.has(premium.policyId)),
    requirements: source.requirements.filter((requirement) =>
      keptSiteIds.has(requirement.siteId),
    ),
    exclusions: source.exclusions.filter((exclusion) => keptSiteIds.has(exclusion.siteId)),
    fxRates: source.fxRates,
    config: source.config,
  };
}

/** Scores against the full portfolio so a filter never changes a site's band. */
function scoreSites(sites: readonly Site[]): ScoredSite[] {
  const thresholds = seedPortfolio.config.thresholds;
  return sites
    .map((site) => {
      const result = scoreSite(site, seedPortfolio);
      const coverSgd = siteTivCoverSgd(site.id, seedPortfolio);
      const gap = coverageGapPct(site.tivSgd, coverSgd);
      const ratio = 1 - gap.value;
      const statuses = seedPortfolio.requirements
        .filter((requirement) => requirement.siteId === site.id)
        .map((requirement) => requirementStatus(requirement, seedPortfolio).status);

      return {
        site,
        score: result.score,
        band: result.band,
        drivers: result.drivers,
        coverSgd,
        tivCoverRatio: ratio,
        gapPct: gap.value * 100,
        underInsured: ratio < thresholds.itvUnder,
        openRequirements: statuses.filter(
          (status) => status === 'Gap' || status === 'Excluded',
        ).length,
      };
    })
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.site.name < b.site.name
          ? -1
          : a.site.name > b.site.name
            ? 1
            : 0,
    );
}

export interface FilteredPortfolioValue {
  filters: FilterState;
  isFiltered: boolean;
  /** The filtered portfolio, safe to pass to any engine function. */
  portfolio: Portfolio;
  summary: GroupSummary;
  /** Filtered sites, highest score first, each with engine output attached. */
  sites: ScoredSite[];
  /** Full entity list, so the select never loses options. */
  entities: Entity[];
  totalSites: number;
  setFilters: (patch: Partial<FilterState>) => void;
  reset: () => void;
}

const FilterContext = createContext<FilteredPortfolioValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const apply = useCallback(
    (next: FilterState) => {
      const normalised: FilterState = { ...next, lines: next.lines === null ? null : normaliseLines(next.lines) };
      setSearchParams(writeFilters(searchParams, normalised), { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const setFilters = useCallback(
    (patch: Partial<FilterState>) => {
      apply({ ...filters, ...patch });
    },
    [apply, filters],
  );

  const reset = useCallback(() => {
    apply(EMPTY_FILTERS);
  }, [apply]);

  const posted = usePostedRecords();
  const base = useMemo(
    () => (posted.length === 0 ? seedPortfolio : applyPostedRecords(seedPortfolio, posted).portfolio),
    [posted],
  );
  const portfolio = useMemo(() => filterPortfolio(base, filters), [base, filters]);
  const summary = useMemo(() => groupSummary(portfolio), [portfolio]);
  const sites = useMemo(() => scoreSites(portfolio.sites), [portfolio.sites]);

  const isFiltered =
    filters.lines !== null ||
    filters.entityId !== null ||
    filters.renewalWindow !== null ||
    filters.gapsOnly ||
    filters.highRiskOnly;

  const value = useMemo<FilteredPortfolioValue>(
    () => ({
      filters,
      isFiltered,
      portfolio,
      summary,
      sites,
      entities: seedPortfolio.entities,
      totalSites: seedPortfolio.sites.length,
      setFilters,
      reset,
    }),
    [filters, isFiltered, portfolio, summary, sites, setFilters, reset],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

/** The one hook every page, card and the action rail reads the view through. */
export function useFilteredPortfolio(): FilteredPortfolioValue {
  const value = useContext(FilterContext);
  if (value === null) {
    throw new Error('useFilteredPortfolio must be called inside <FilterProvider>');
  }
  return value;
}
