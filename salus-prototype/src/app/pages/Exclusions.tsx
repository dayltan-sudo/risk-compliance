import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';

import { findExclusionOverride, formatSgd, requirementStatus, toSgd } from '../../engine';
import type { ContractRequirement, Exclusion, Portfolio } from '../../engine';
import { formatDate, formatMoneyCompact } from '../components/format';
import { useFilteredPortfolio } from '../layout/filters';
import { Card, KpiTile, Tag } from '../ui';

/**
 * Insurance exclusion register.
 *
 * A row conflicts when the engine's exclusion override is what makes a
 * requirement Excluded. That is stricter than "same site and line": a
 * sub-limit sitting above the required limit does not conflict. Every value
 * here comes from the portfolio currently in scope, or from `requirementStatus` /
 * `findExclusionOverride`.
 */

type ExclusionRow = {
  exclusion: Exclusion;
  siteName: string;
  policyNo: string | null;
  carrierName: string | null;
  sublimitSgd: number | null;
  /** Requirements this exclusion is the deciding override for. */
  conflicting: ContractRequirement[];
};

function buildConflictMap(portfolio: Portfolio): Map<string, ContractRequirement[]> {
  const asOf = portfolio.config.effectiveFrom;
  const map = new Map<string, ContractRequirement[]>();

  for (const requirement of portfolio.requirements) {
    const assessment = requirementStatus(requirement, portfolio, asOf);
    const override = findExclusionOverride(requirement, assessment.requiredSgd, portfolio, asOf);
    if (override === null) continue;
    const existing = map.get(override.exclusion.id);
    if (existing === undefined) {
      map.set(override.exclusion.id, [requirement]);
    } else {
      existing.push(requirement);
    }
  }

  return map;
}

function buildRows(portfolio: Portfolio): ExclusionRow[] {
  const asOf = portfolio.config.effectiveFrom;
  const conflicts = buildConflictMap(portfolio);

  return portfolio.exclusions.map((exclusion) => {
    const coverage = portfolio.coverages.find(
      (candidate) => candidate.id === exclusion.coverageId,
    );
    const policy = coverage
      ? portfolio.policies.find((candidate) => candidate.id === coverage.policyId)
      : undefined;
    const carrier = policy
      ? portfolio.carriers.find((candidate) => candidate.id === policy.carrierId)
      : undefined;

    const sublimitSgd =
      exclusion.scope === 'sublimit' && exclusion.sublimit !== undefined && coverage !== undefined
        ? toSgd(exclusion.sublimit, coverage.currency, portfolio.fxRates, asOf)
        : null;

    return {
      exclusion,
      siteName:
        portfolio.sites.find((candidate) => candidate.id === exclusion.siteId)?.name ??
        exclusion.siteId,
      policyNo: policy?.policyNo ?? null,
      carrierName: carrier?.name ?? null,
      sublimitSgd,
      conflicting: conflicts.get(exclusion.id) ?? [],
    };
  });
}

type ScopeFilter = 'all' | 'conflicts';

function WordingExcerpt({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      aria-expanded={expanded}
      title={expanded ? 'Collapse the excerpt' : 'Read the full wording excerpt'}
      style={wordingButtonStyle}
    >
      <span style={expanded ? wordingTextStyle : clampStyle}>{text}</span>
      <span style={excerptToggleStyle}>{expanded ? 'Show less' : 'Read full clause'}</span>
    </button>
  );
}

export function Exclusions() {
  const { portfolio } = useFilteredPortfolio();
  const AS_OF = portfolio.config.effectiveFrom;
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');

  const rows = useMemo(() => buildRows(portfolio), [portfolio]);
  const fullCount = useMemo(
    () => portfolio.exclusions.filter((row) => row.scope === 'full').length,
    [portfolio],
  );
  const sublimitCount = portfolio.exclusions.length - fullCount;
  const conflictCount = useMemo(
    () => rows.filter((row) => row.conflicting.length > 0).length,
    [rows],
  );
  const underminedCount = useMemo(
    () => rows.reduce((total, row) => total + row.conflicting.length, 0),
    [rows],
  );

  const visible = rows.filter(
    (row) => scopeFilter === 'all' || row.conflicting.length > 0,
  );

  // The exception queue links here as `/exclusions#<exclusion id>`. Client-side
  // navigation does not scroll to a fragment on its own, and neither does a
  // reload into an SPA before the row exists, so bring the row into view.
  const { hash } = useLocation();
  const hashId = hash.replace(/^#/, '');

  useEffect(() => {
    if (hashId === '') return;
    const target = document.getElementById(hashId);
    if (target !== null && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center' });
    }
  }, [hashId, scopeFilter]);

  return (
    <div className="sal-page" style={pageStyle}>
      <header style={headerStyle}>
        <p style={eyebrowStyle}>Exclusions · P4</p>
        <h1>Insurance exclusions</h1>
        <p style={subtitleStyle}>
          Policy wording that removes a peril or caps a limit, and the contract requirements it
          defeats. {portfolio.exclusions.length} exclusions assessed at {formatDate(AS_OF)};{' '}
          {conflictCount} conflict with an open requirement.
        </p>
      </header>

      <section aria-label="Exclusion summary" style={tilesStyle}>
        <KpiTile
          label="Exclusions"
          value={portfolio.exclusions.length}
          hint="Full exclusions and sub-limits"
        />
        <KpiTile
          label="Full exclusions"
          value={fullCount}
          tone="info"
          hint="Peril removed outright"
        />
        <KpiTile
          label="Sub-limits"
          value={sublimitCount}
          tone="warn"
          hint="Peril capped below the policy limit"
        />
        <KpiTile
          label="Conflicts"
          value={conflictCount}
          tone="bad"
          hint={`${underminedCount} requirements flipped to Excluded`}
          info="An exclusion conflicts when it is the reason a requirement is Excluded. A sub-limit above the required limit does not conflict."
        />
      </section>

      <Card
        title="Exclusion register"
        subtitle="The wording excerpt is the evidence. Click it to read the full clause."
        padded={false}
        footer="Synthetic data only. Conflict status is derived by the engine's exclusion override against the requirements currently in scope."
      >
        <div style={toolbarStyle}>
          <div className="sal-seg" role="group" aria-label="Filter exclusions">
            <button
              type="button"
              className={
                scopeFilter === 'all' ? 'sal-seg__btn sal-seg__btn--active' : 'sal-seg__btn'
              }
              aria-pressed={scopeFilter === 'all'}
              onClick={() => setScopeFilter('all')}
            >
              All <span className="sal-mono">{rows.length}</span>
            </button>
            <button
              type="button"
              className={
                scopeFilter === 'conflicts'
                  ? 'sal-seg__btn sal-seg__btn--active'
                  : 'sal-seg__btn'
              }
              aria-pressed={scopeFilter === 'conflicts'}
              onClick={() => setScopeFilter('conflicts')}
            >
              Conflicts only <span className="sal-mono">{conflictCount}</span>
            </button>
          </div>
          <span style={toolbarCountStyle}>{visible.length} shown</span>
        </div>

        <div className="sal-table-wrap">
          <table className="sal-table">
            <caption className="sal-sr-only">
              Insurance exclusions with scope, peril, sub-limit, clause, wording excerpt and any
              conflicting contract requirement
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: '16%' }}>
                  Site
                </th>
                <th scope="col" style={{ width: '11%' }}>
                  Coverage line
                </th>
                <th scope="col" style={{ width: '8%' }}>
                  Scope
                </th>
                <th scope="col" style={{ width: '10%' }}>
                  Peril
                </th>
                <th scope="col" className="sal-table__cell--right" style={{ width: '11%' }}>
                  Sub-limit
                </th>
                <th scope="col" style={{ width: '10%' }}>
                  Clause
                </th>
                <th scope="col" style={{ width: '20%' }}>
                  Wording excerpt
                </th>
                <th scope="col" style={{ width: '14%' }}>
                  Open requirement
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td className="sal-table__empty" colSpan={8}>
                    <span className="sal-table__empty-title">No conflicting exclusions</span>
                    Every exclusion in the register leaves its requirements intact.
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const { exclusion, conflicting } = row;
                  const conflict = conflicting.length > 0;

                  return (
                    <tr
                      key={exclusion.id}
                      id={exclusion.id}
                      style={{ scrollMarginTop: 'calc(var(--topbar-h) + var(--space-lg))' }}
                    >
                      <td style={conflict ? conflictMarkerStyle : undefined}>
                        <span style={siteNameStyle}>{row.siteName}</span>
                        <span style={subLineStyle}>
                          {row.policyNo ?? 'Policy not recorded'} ·{' '}
                          {row.carrierName ?? 'Carrier not recorded'}
                        </span>
                      </td>
                      <td>{exclusion.line}</td>
                      <td>
                        <Tag tone={exclusion.scope === 'full' ? 'critical' : 'medium'}>
                          {exclusion.scope === 'full' ? 'Full' : 'Sub-limit'}
                        </Tag>
                      </td>
                      <td>{exclusion.peril}</td>
                      <td className="sal-table__cell--right sal-table__num">
                        {row.sublimitSgd === null ? (
                          <span style={mutedStyle}>—</span>
                        ) : (
                          <span title={formatSgd(row.sublimitSgd)}>
                            {formatMoneyCompact(row.sublimitSgd)}
                          </span>
                        )}
                      </td>
                      <td className="sal-table__num">{exclusion.clauseRef}</td>
                      <td>
                        <WordingExcerpt text={exclusion.wordingExcerpt} />
                      </td>
                      <td>
                        {conflict ? (
                          conflicting.map((requirement) => (
                            <a
                              key={requirement.id}
                              href={`/contracts#${requirement.id}`}
                              style={conflictLinkStyle}
                              title={`${requirement.counterparty} requires ${requirement.line} cover for ${requirement.peril}`}
                            >
                              <span style={monoSmallStyle}>{requirement.id}</span>{' '}
                              {requirement.counterparty}
                            </a>
                          ))
                        ) : (
                          <span style={mutedStyle}>No conflict</span>
                        )}
                      </td>
                    </tr>
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

const toolbarCountStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
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

const clampStyle: CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

const wordingTextStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-serif)',
  fontSize: 'var(--text-body-sm)',
  lineHeight: 'var(--leading-normal)',
  color: 'var(--ink)',
};

const wordingButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 0,
  border: 0,
  background: 'none',
  textAlign: 'left',
  color: 'inherit',
  cursor: 'pointer',
};

const excerptToggleStyle: CSSProperties = {
  display: 'block',
  marginTop: 'var(--space-xxs)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--accent-deep)',
};

const conflictMarkerStyle: CSSProperties = {
  boxShadow: 'inset 3px 0 0 var(--accent)',
};

const conflictLinkStyle: CSSProperties = {
  display: 'block',
  marginBottom: 'var(--space-xxs)',
  color: 'var(--accent-deep)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  lineHeight: 'var(--leading-snug)',
};

const monoSmallStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.03em',
};

const mutedStyle: CSSProperties = {
  color: 'var(--muted)',
};
