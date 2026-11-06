import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import {
  findExclusionOverride,
  formatSgd,
  requirementStatus,
  requirementSummary,
} from '../../engine';
import type {
  ContractRequirement,
  Exclusion,
  Portfolio,
  RequirementStatus,
} from '../../engine';
import { GlossaryTerm } from '../components/Glossary';
import { formatDate, formatMoneyCompact, formatPct } from '../components/format';
import { useScopedSession } from '../components/sessionScope';
import { EMPTY_FILTERS, filterPortfolio, useFilteredPortfolio } from '../layout/filters';
import { Card, KpiTile, Tag } from '../ui';

/**
 * Contract requirement register.
 *
 * Every figure on this page is an engine result: `requirementStatus` supplies
 * the ratio, status and override note, `requirementSummary` supplies the
 * counts. The page only formats, filters, searches and expands them.
 *
 * Two scopes meet here and are kept apart on purpose:
 *
 * - the URL filter (`?entity=`, `?line=` …) is a view control, and the FilterBar
 *   above the page owns it;
 * - the session scope (`/api/session/portfolio`) is who the server says you
 *   are. A scoped role narrows the register before any count is taken, so the
 *   tiles, the "N of M" line and the rows always describe the same book.
 *
 * `?q=` is the search term, held in the URL so a shared link reproduces the
 * view. It never changes the totals: those stay on the scoped register and the
 * toolbar reports "N shown of M".
 */

const EXCLUDED_HINT =
  'Excluded is a qualitative failure: the placed limit can be sufficient, but policy wording removes the required peril. A Gap is a numerical shortfall in the placed limit.';

const COLUMN_COUNT = 9;

type RequirementRow = {
  requirement: ContractRequirement;
  siteName: string;
  assetLabel: string;
  status: RequirementStatus;
  ratio: number;
  requiredSgd: number;
  placedSgd: number;
  tolerance: number;
  note?: string;
  exclusion: Exclusion | null;
  exclusionPolicyNo: string | null;
  exclusionCarrier: string | null;
  /** Policies and coverage ids that respond to this requirement, for search. */
  policyNos: string[];
  coverageIds: string[];
  /** Lower-cased haystack: every field the search box matches. */
  searchText: string;
};

/** Clause forms the search box should accept for `Cl. 8.4`. */
function clauseForms(clauseRef: string): string[] {
  const digits = clauseRef.replace(/[^0-9.]/g, '');
  const forms = [clauseRef];
  if (digits !== '') forms.push(`clause ${digits}`, `cl ${digits}`);
  return forms;
}

function buildRows(portfolio: Portfolio): RequirementRow[] {
  const asOf = portfolio.config.effectiveFrom;

  return portfolio.requirements.map((requirement) => {
    const assessment = requirementStatus(requirement, portfolio, asOf);
    const override = findExclusionOverride(requirement, assessment.requiredSgd, portfolio, asOf);
    const site = portfolio.sites.find((candidate) => candidate.id === requirement.siteId);
    const asset = portfolio.assets.find((candidate) => candidate.id === requirement.assetId);

    let policyNo: string | null = null;
    let carrierName: string | null = null;
    if (override !== null) {
      const coverage = portfolio.coverages.find(
        (candidate) => candidate.id === override.exclusion.coverageId,
      );
      const policy = coverage
        ? portfolio.policies.find((candidate) => candidate.id === coverage.policyId)
        : undefined;
      const carrier = policy
        ? portfolio.carriers.find((candidate) => candidate.id === policy.carrierId)
        : undefined;
      policyNo = policy?.policyNo ?? null;
      carrierName = carrier?.name ?? null;
    }

    // Coverages that answer this requirement's site and line, so a policy
    // number or coverage id in the search box finds the row that depends on it.
    const responding = portfolio.coverages.filter(
      (candidate) => candidate.siteId === requirement.siteId && candidate.line === requirement.line,
    );
    const respondingPolicyIds = new Set(responding.map((candidate) => candidate.policyId));
    const policyNos = portfolio.policies
      .filter((candidate) => respondingPolicyIds.has(candidate.id))
      .map((candidate) => candidate.policyNo);
    const coverageIds = responding.map((candidate) => candidate.id);

    const siteName = site?.name ?? requirement.siteId;
    const prefix = `${siteName} \u2014 `;
    const assetLabel =
      asset === undefined
        ? requirement.assetId
        : asset.label.startsWith(prefix)
          ? asset.label.slice(prefix.length)
          : asset.label;

    const searchText = [
      siteName,
      assetLabel,
      requirement.counterparty,
      requirement.counterpartyType,
      requirement.agreementRef,
      ...clauseForms(requirement.clauseRef),
      requirement.line,
      requirement.peril,
      ...policyNos,
      ...coverageIds,
    ]
      .join(' ')
      .toLowerCase();

    return {
      requirement,
      siteName,
      assetLabel,
      status: assessment.status,
      ratio: assessment.ratio,
      requiredSgd: assessment.requiredSgd,
      placedSgd: assessment.placedSgd,
      tolerance: assessment.tolerance,
      note: assessment.note,
      exclusion: override?.exclusion ?? null,
      exclusionPolicyNo: policyNo,
      exclusionCarrier: carrierName,
      policyNos,
      coverageIds,
      searchText,
    };
  });
}

/**
 * Every whitespace-separated token must appear in the haystack, so "clause 8.4"
 * and "merlion 8.4" both work without an index or a dependency.
 */
export function matchesQuery(searchText: string, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter((token) => token !== '');
  if (tokens.length === 0) return true;
  return tokens.every((token) => searchText.includes(token));
}

type Filter = 'all' | 'attention' | RequirementStatus;

function matchesFilter(status: RequirementStatus, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'attention') return status === 'Gap' || status === 'At-risk';
  return status === filter;
}

/**
 * Empty states name the cause. A scoped role is never described as a filter the
 * reader could clear, a search is never described as missing data, and when
 * both apply the copy says so.
 */
export function emptyStateFor(input: {
  query: string;
  scopeName: string | null;
  role: string | null;
  rowsInScope: number;
  outOfScope: number;
  filterLabel: string;
}): { title: string; body: string } {
  const query = input.query.trim();
  const plural = (count: number): string => (count === 1 ? '' : 's');
  const role = input.role ?? 'a scoped role';

  if (query !== '') {
    return {
      title: `No requirements match “${query}”`,
      body: `Searched site, asset, counterparty, agreement and clause reference, and policy or coverage id across ${input.rowsInScope} requirement${plural(input.rowsInScope)}${input.scopeName === null ? '' : ` in ${input.scopeName}`}.`,
    };
  }

  if (input.scopeName !== null && input.rowsInScope === 0) {
    return {
      title: `No requirements in ${input.scopeName}`,
      body: `You are viewing as ${role}, which limits this register to ${input.scopeName}. ${input.outOfScope} requirement${plural(input.outOfScope)} sit outside that scope.`,
    };
  }

  if (input.scopeName !== null) {
    return {
      title: `No ${input.filterLabel} requirements in ${input.scopeName}`,
      body: `You are viewing as ${role}, which limits this register to ${input.scopeName}: ${input.rowsInScope} requirement${plural(input.rowsInScope)} in total, none of them ${input.filterLabel}.`,
    };
  }

  return {
    title: 'No requirements in this view',
    body: `No requirement currently has the ${input.filterLabel} status. Clear the status filter to see all ${input.rowsInScope}.`,
  };
}

function statusExplanation(row: RequirementRow): string {
  if (row.status === 'Excluded') {
    const peril = row.exclusion?.peril ?? 'the required peril';
    if (row.ratio >= 1) {
      return `Excluded is a qualitative failure, not a shortfall: the placed limit is sufficient, but the policy removes ${peril}, so the cover the contract requires does not exist.`;
    }
    return `Excluded overrides the ratio: the policy removes ${peril}, so the requirement fails on wording even though the placed limit is also short.`;
  }
  if (row.status === 'Gap') {
    return `Gap is a numerical failure: the placed limit is ${formatSgd(row.requiredSgd - row.placedSgd)} below the required limit.`;
  }
  if (row.status === 'At-risk') {
    return `At-risk: the placed limit is within the ${formatPct(row.tolerance * 100, 0)} tolerance but below the required limit.`;
  }
  return 'Met: the placed limit clears the requirement and no exclusion removes the peril.';
}

function RequirementDetail({ row }: { row: RequirementRow }) {
  const { requirement, exclusion } = row;

  return (
    <div style={detailGridStyle}>
      <div>
        <p style={detailLabelStyle}>Contractual source</p>
        <p style={detailValueStyle}>
          {requirement.agreementRef} · {requirement.clauseRef}
        </p>
        <p style={detailMutedStyle}>
          {requirement.counterparty} ({requirement.counterpartyType}) · {row.siteName} ·{' '}
          {row.assetLabel}
        </p>
      </div>

      <div>
        <p style={detailLabelStyle}>Assessment</p>
        <p style={detailValueStyle}>
          {row.status} · {formatPct(row.ratio * 100)} <GlossaryTerm id="placement">placed</GlossaryTerm>{' '}
          · {formatMoneyCompact(row.requiredSgd)} required
        </p>
        <p style={detailMutedStyle}>{statusExplanation(row)}</p>
      </div>

      <div style={{ gridColumn: '1 / -1' }}>
        <p style={detailLabelStyle}>Exclusion override</p>
        {exclusion === null ? (
          <p style={detailMutedStyle}>
            None. The status follows from the placed-to-required ratio.
          </p>
        ) : (
          <>
            <p style={detailValueStyle}>
              <a href={`/exclusions#${exclusion.id}`} style={linkStyle}>
                {exclusion.clauseRef}
              </a>{' '}
              · Full exclusion · {exclusion.peril} · {exclusion.line}
            </p>
            <p style={wordingStyle}>“{exclusion.wordingExcerpt}”</p>
            <p style={detailMutedStyle}>
              {row.exclusionCarrier ?? 'Carrier not recorded'} · policy{' '}
              {row.exclusionPolicyNo ?? 'not recorded'} ·{' '}
              <a href={`/exclusions#${exclusion.id}`} style={linkStyle}>
                View {exclusion.id} in exclusions
              </a>
            </p>
          </>
        )}
        {row.note ? <p style={detailMutedStyle}>Engine note: {row.note}</p> : null}
      </div>
    </div>
  );
}

export function Contracts() {
  const { portfolio } = useFilteredPortfolio();
  const { session } = useScopedSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const AS_OF = portfolio.config.effectiveFrom;
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = searchParams.get('q') ?? '';

  const setQuery = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next.trim() === '') params.delete('q');
    else params.set('q', next);
    setSearchParams(params, { replace: true });
  };

  /** The session's entity, when the server says the role is entity-scoped. */
  const scopeEntityId =
    session !== null && session.scope.kind === 'entity' ? session.scope.entityId : null;
  const scopeName = scopeEntityId === null ? null : (session?.scope.entityName ?? scopeEntityId);

  /**
   * Session scope is applied before any count is taken. Reusing the FilterBar's
   * own predicate means a scoped champion and a hand-picked entity filter can
   * never disagree about what an entity contains.
   */
  const scoped = useMemo(
    () =>
      scopeEntityId === null
        ? portfolio
        : filterPortfolio(portfolio, { ...EMPTY_FILTERS, entityId: scopeEntityId }),
    [portfolio, scopeEntityId],
  );

  const rows = useMemo(() => buildRows(scoped), [scoped]);
  const counts = useMemo(() => requirementSummary(scoped, AS_OF), [scoped, AS_OF]);

  /** Requirements in the view before the session narrowed it, for the empty state. */
  const outOfScopeCount = useMemo(
    () => (scopeEntityId === null ? 0 : buildRows(portfolio).length - rows.length),
    [portfolio, scopeEntityId, rows.length],
  );

  /** Required minus placed, summed across every requirement below 100%. */
  const exposureSgd = useMemo(
    () =>
      rows.reduce(
        (total, row) => (row.ratio < 1 ? total + (row.requiredSgd - row.placedSgd) : total),
        0,
      ),
    [rows],
  );

  const FILTERS: ReadonlyArray<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'Met', label: 'Met', count: counts.Met },
    { key: 'At-risk', label: 'At-risk', count: counts['At-risk'] },
    { key: 'Gap', label: 'Gap', count: counts.Gap },
    { key: 'Excluded', label: 'Excluded', count: counts.Excluded },
    { key: 'attention', label: 'Gaps and at-risk', count: counts.Gap + counts['At-risk'] },
  ];

  const searched = rows.filter((row) => matchesQuery(row.searchText, query));
  const visible = searched.filter((row) => matchesFilter(row.status, filter));
  const trimmedQuery = query.trim();
  const activeFilterLabel = FILTERS.find((option) => option.key === filter)?.label ?? 'filtered';

  /* Deep link: /contracts#req-06 opens that row and highlights it. */
  const hashId = useMemo(() => {
    const raw = location.hash.replace(/^#/, '');
    if (raw === '') return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [location.hash]);

  useEffect(() => {
    if (hashId === '' || !rows.some((row) => row.requirement.id === hashId)) return;
    setExpandedId(hashId);
    const target = document.getElementById(hashId);
    if (target !== null && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center' });
    }
  }, [hashId, rows]);

  const toggle = (id: string) =>
    setExpandedId((current) => (current === id ? null : id));

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(id);
    }
  };

  const emptyState = emptyStateFor({
    query: trimmedQuery,
    scopeName,
    role: session?.role ?? null,
    rowsInScope: rows.length,
    outOfScope: outOfScopeCount,
    filterLabel: activeFilterLabel,
  });

  return (
    <div className="sal-page" style={pageStyle}>
      <header style={headerStyle}>
        <p style={eyebrowStyle}>Contracts · P4</p>
        <h1>Contract requirements</h1>
        <p style={subtitleStyle}>
          What counterparties require us to insure, and whether the{' '}
          <GlossaryTerm id="placement">placed</GlossaryTerm> programme actually does it.{' '}
          {counts.total} requirements across {scoped.sites.length} sites, assessed at{' '}
          {formatDate(AS_OF)}. {counts.Excluded} {counts.Excluded === 1 ? 'is' : 'are'} excluded by
          policy wording, not by a limit shortfall.
          {scopeName === null ? '' : ` Showing ${scopeName} only, because of your role.`}
        </p>
      </header>

      <section aria-label="Requirement summary" style={tilesStyle}>
        <KpiTile label="Requirements" value={counts.total} hint="In the register" />
        <KpiTile
          label="Met"
          value={counts.Met}
          tone="good"
          hint="Placed limit clears the requirement"
        />
        <KpiTile
          label="At-risk"
          value={counts['At-risk']}
          tone="warn"
          hint={`Within the ${formatPct(portfolio.config.thresholds.atRiskTolerance * 100, 0)} tolerance`}
        />
        <KpiTile
          label="Gap"
          value={counts.Gap}
          tone="bad"
          hint="Placed limit below the required limit"
        />
        <KpiTile
          label="Excluded"
          value={counts.Excluded}
          hint="Peril removed by policy wording"
          info={EXCLUDED_HINT}
        />
        <KpiTile
          label="Open contractual exposure"
          value={formatMoneyCompact(exposureSgd)}
          tone="bad"
          hint={`Exact shortfall ${formatSgd(exposureSgd)}`}
          info="Required minus placed on every requirement with a ratio below 100%."
        />
      </section>

      <Card
        title="Requirement register"
        subtitle={
          <>
            Search a clause, a site, a counterparty or a policy, then click a row for its
            contractual source and any <GlossaryTerm id="exclusion">exclusion override</GlossaryTerm>.
          </>
        }
        padded={false}
        footer={`Synthetic data only. Limits, ratios and statuses are engine results for the portfolio currently in scope as at ${formatDate(AS_OF)}.`}
      >
        <div style={toolbarStyle}>
          <div style={toolbarLeftStyle}>
            <label style={searchStyle}>
              <span className="sal-field__label">Search</span>
              <input
                type="search"
                name="q"
                value={query}
                aria-label="Search contract requirements by site, counterparty, clause or policy"
                placeholder="Site, counterparty, Cl. 8.4, policy no."
                onChange={(event) => setQuery(event.target.value)}
                style={searchInputStyle}
              />
            </label>

            <div
              className="sal-seg"
              role="group"
              aria-label="Filter requirements by status"
              style={{ flexWrap: 'wrap' }}
            >
              {FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={
                    filter === option.key ? 'sal-seg__btn sal-seg__btn--active' : 'sal-seg__btn'
                  }
                  aria-pressed={filter === option.key}
                  onClick={() => setFilter(option.key)}
                >
                  {option.label} <span className="sal-mono">{option.count}</span>
                </button>
              ))}
            </div>
          </div>

          <span style={toolbarCountStyle} aria-live="polite">
            {visible.length} shown of {rows.length}
          </span>
        </div>

        <div className="sal-table-wrap">
          <table className="sal-table">
            <caption className="sal-sr-only">
              Contract requirements with clause reference, required and placed limits, ratio,
              status and any override note
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: '16%' }}>
                  Site / asset
                </th>
                <th scope="col" style={{ width: '13%' }}>
                  Clause
                </th>
                <th scope="col" style={{ width: '14%' }}>
                  Counterparty
                </th>
                <th scope="col" style={{ width: '11%' }}>
                  Coverage line
                </th>
                <th scope="col" className="sal-table__cell--right" style={{ width: '9%' }}>
                  Required
                </th>
                <th scope="col" className="sal-table__cell--right" style={{ width: '9%' }}>
                  Placed
                </th>
                <th scope="col" className="sal-table__cell--right" style={{ width: '7%' }}>
                  Ratio
                </th>
                <th scope="col" style={{ width: '9%' }}>
                  Status
                </th>
                <th scope="col" style={{ width: '12%' }}>
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td className="sal-table__empty" colSpan={COLUMN_COUNT}>
                    <span className="sal-table__empty-title">{emptyState.title}</span>
                    {emptyState.body}
                    {trimmedQuery === '' ? null : (
                      <span style={emptyActionStyle}>
                        <button
                          type="button"
                          className="sal-btn sal-btn--ghost sal-btn--sm"
                          onClick={() => setQuery('')}
                        >
                          Clear search
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const id = row.requirement.id;
                  const expanded = expandedId === id;
                  const excluded = row.status === 'Excluded';
                  const highlighted = hashId === id;

                  return (
                    <Fragment key={id}>
                      <tr
                        id={id}
                        data-clickable="true"
                        data-selected={expanded ? 'true' : undefined}
                        data-highlighted={highlighted ? 'true' : undefined}
                        aria-expanded={expanded}
                        aria-controls={`requirement-detail-${id}`}
                        tabIndex={0}
                        onClick={() => toggle(id)}
                        onKeyDown={(event) => handleKeyDown(event, id)}
                        style={{
                          scrollMarginTop: 'calc(var(--topbar-h) + var(--space-lg))',
                          ...(highlighted ? highlightedRowStyle : {}),
                        }}
                      >
                        <td style={excluded ? excludedMarkerStyle : undefined}>
                          <span style={siteCellStyle}>
                            <span aria-hidden="true" style={caretStyle}>
                              {expanded ? '▾' : '▸'}
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <span style={siteNameStyle}>{row.siteName}</span>
                              <span style={subLineStyle}>{row.assetLabel}</span>
                            </span>
                          </span>
                        </td>
                        <td>
                          <span style={clauseCellStyle}>{row.requirement.clauseRef}</span>
                          <span
                            style={agreementStyle}
                            title={`Agreement ${row.requirement.agreementRef}`}
                          >
                            {row.requirement.agreementRef}
                          </span>
                        </td>
                        <td>
                          <span style={primaryCellStyle}>{row.requirement.counterparty}</span>
                          <span style={microUpperStyle}>{row.requirement.counterpartyType}</span>
                        </td>
                        <td>
                          <span style={primaryCellStyle}>{row.requirement.line}</span>
                          <span style={subLineStyle}>{row.requirement.peril}</span>
                        </td>
                        <td
                          className="sal-table__cell--right sal-table__num"
                          title={formatSgd(row.requiredSgd)}
                        >
                          {formatMoneyCompact(row.requiredSgd)}
                        </td>
                        <td
                          className="sal-table__cell--right sal-table__num"
                          title={formatSgd(row.placedSgd)}
                        >
                          {formatMoneyCompact(row.placedSgd)}
                        </td>
                        <td className="sal-table__cell--right sal-table__num">
                          {formatPct(row.ratio * 100)}
                        </td>
                        <td>
                          <Tag tone={row.status} dot title={excluded ? EXCLUDED_HINT : undefined}>
                            {row.status}
                          </Tag>
                          {excluded ? <span style={qualitativeStyle}>qualitative</span> : null}
                        </td>
                        <td style={noteStyle}>
                          {row.note ? (
                            <span style={clampStyle} title={row.note}>
                              {row.note}
                            </span>
                          ) : (
                            <span style={mutedStyle}>None</span>
                          )}
                        </td>
                      </tr>

                      {expanded ? (
                        <tr id={`requirement-detail-${id}`}>
                          <td colSpan={COLUMN_COUNT} style={detailCellStyle}>
                            <RequirementDetail row={row} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ styles */

const pageStyle: CSSProperties = {
  maxWidth: 'var(--page-max)',
  margin: '0 auto',
  padding: 'var(--space-page)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-section)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-xs)',
};

const eyebrowStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--dusk-dim)',
};

const subtitleStyle: CSSProperties = {
  maxWidth: '84ch',
  fontSize: 'var(--text-body)',
  lineHeight: 'var(--leading-relaxed)',
  color: 'var(--muted)',
};

const tilesStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
  gap: 'var(--space-lg)',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 'var(--space-md)',
  padding: 'var(--space-md) var(--space-xxxl)',
  borderBottom: 'var(--border-hairline)',
};

const toolbarLeftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 'var(--space-md)',
  minWidth: 0,
  flex: '1 1 min(380px, 100%)',
};

const searchStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-xs)',
  minWidth: 0,
  flex: '0 1 300px',
};

const searchInputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: '32px',
  padding: '0 var(--space-sm)',
  border: 'var(--border-hairline)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontSize: 'var(--text-sm)',
};

const toolbarCountStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  whiteSpace: 'nowrap',
};

const emptyActionStyle: CSSProperties = {
  display: 'block',
  marginTop: 'var(--space-md)',
};

const siteCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-xs)',
};

const caretStyle: CSSProperties = {
  flex: 'none',
  marginTop: '1px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-tiny)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--muted)',
};

const siteNameStyle: CSSProperties = {
  display: 'block',
  fontWeight: 'var(--weight-semibold)',
  lineHeight: 'var(--leading-snug)',
};

const subLineStyle: CSSProperties = {
  display: 'block',
  marginTop: '1px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--muted)',
};

const clauseCellStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-semibold)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink)',
};

const agreementStyle: CSSProperties = {
  display: 'block',
  marginTop: '1px',
  overflow: 'hidden',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  lineHeight: 'var(--leading-snug)',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--muted)',
};

const highlightedRowStyle: CSSProperties = {
  background: 'var(--accent-tint)',
  boxShadow: 'inset 3px 0 0 var(--accent)',
};

const microUpperStyle: CSSProperties = {
  display: 'block',
  marginTop: '1px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

const primaryCellStyle: CSSProperties = {
  display: 'block',
  lineHeight: 'var(--leading-snug)',
};

const noteStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--muted)',
};

const qualitativeStyle: CSSProperties = {
  display: 'block',
  marginTop: '2px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: 'var(--ink-850)',
};

const clampStyle: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

const mutedStyle: CSSProperties = {
  color: 'var(--muted)',
};

const excludedMarkerStyle: CSSProperties = {
  boxShadow: 'inset 3px 0 0 var(--ink-950)',
};

const detailCellStyle: CSSProperties = {
  padding: 'var(--space-xl) var(--space-xxl)',
  background: 'var(--paper)',
  borderBottom: 'var(--border-hairline)',
};

const detailGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 'var(--space-xl) var(--space-gutter)',
};

const detailLabelStyle: CSSProperties = {
  marginBottom: 'var(--space-xxs)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--dusk-dim)',
};

const detailValueStyle: CSSProperties = {
  lineHeight: 'var(--leading-snug)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--ink)',
};

const detailMutedStyle: CSSProperties = {
  marginTop: 'var(--space-xxs)',
  fontSize: 'var(--text-xs)',
  lineHeight: 'var(--leading-relaxed)',
  color: 'var(--muted)',
};

const wordingStyle: CSSProperties = {
  marginTop: 'var(--space-xs)',
  fontFamily: 'var(--font-serif)',
  fontSize: 'var(--text-body)',
  lineHeight: 'var(--leading-relaxed)',
  color: 'var(--ink)',
};

const linkStyle: CSSProperties = {
  color: 'var(--accent-deep)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
};
