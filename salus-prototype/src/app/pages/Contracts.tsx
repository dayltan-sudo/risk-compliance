import { Fragment, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

import { portfolio } from '../../data/portfolio';
import {
  findExclusionOverride,
  formatSgd,
  requirementStatus,
  requirementSummary,
} from '../../engine';
import type { ContractRequirement, Exclusion, RequirementStatus } from '../../engine';
import { formatDate, formatMoneyCompact, formatPct } from '../components/format';
import { Card, KpiTile, Tag } from '../ui';

/**
 * Contract requirement register.
 *
 * Every figure on this page is an engine result: `requirementStatus` supplies
 * the ratio, status and override note, `requirementSummary` supplies the
 * counts. The page only formats, filters and expands them.
 */

const AS_OF = portfolio.config.effectiveFrom;

const EXCLUDED_HINT =
  'Excluded is a qualitative failure: the placed limit can be sufficient, but policy wording removes the required peril. A Gap is a numerical shortfall in the placed limit.';

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
};

function buildRows(): RequirementRow[] {
  return portfolio.requirements.map((requirement) => {
    const assessment = requirementStatus(requirement, portfolio, AS_OF);
    const override = findExclusionOverride(requirement, assessment.requiredSgd, portfolio, AS_OF);
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

    const siteName = site?.name ?? requirement.siteId;
    const prefix = `${siteName} \u2014 `;
    const assetLabel =
      asset === undefined
        ? requirement.assetId
        : asset.label.startsWith(prefix)
          ? asset.label.slice(prefix.length)
          : asset.label;

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
    };
  });
}

const rows = buildRows();
const counts = requirementSummary(portfolio, AS_OF);

/** Required minus placed, summed across every requirement below 100%. */
const exposureSgd = rows.reduce(
  (total, row) => (row.ratio < 1 ? total + (row.requiredSgd - row.placedSgd) : total),
  0,
);

type Filter = 'all' | 'attention' | RequirementStatus;

const FILTERS: ReadonlyArray<{ key: Filter; label: string; count: number }> = [
  { key: 'all', label: 'All', count: counts.total },
  { key: 'Met', label: 'Met', count: counts.Met },
  { key: 'At-risk', label: 'At-risk', count: counts['At-risk'] },
  { key: 'Gap', label: 'Gap', count: counts.Gap },
  { key: 'Excluded', label: 'Excluded', count: counts.Excluded },
  { key: 'attention', label: 'Gaps and at-risk', count: counts.Gap + counts['At-risk'] },
];

function matchesFilter(status: RequirementStatus, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'attention') return status === 'Gap' || status === 'At-risk';
  return status === filter;
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
          {row.status} · {formatPct(row.ratio * 100)} placed · {formatMoneyCompact(row.requiredSgd)}{' '}
          required
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
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = rows.filter((row) => matchesFilter(row.status, filter));

  const toggle = (id: string) =>
    setExpandedId((current) => (current === id ? null : id));

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(id);
    }
  };

  return (
    <div className="sal-page" style={pageStyle}>
      <header style={headerStyle}>
        <p style={eyebrowStyle}>Contracts · P4</p>
        <h1>Contract requirements</h1>
        <p style={subtitleStyle}>
          What counterparties require us to insure, and whether the placed programme actually does
          it. {counts.total} requirements across {portfolio.sites.length} sites, assessed at{' '}
          {formatDate(AS_OF)}. {counts.Excluded} are excluded by policy wording, not by a limit
          shortfall.
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
        subtitle="Click a row for its contractual source and any exclusion override."
        padded={false}
        footer={`Synthetic data only. Limits, ratios and statuses are engine results from the seed portfolio as at ${formatDate(AS_OF)}.`}
      >
        <div style={toolbarStyle}>
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
          <span style={toolbarCountStyle}>{visible.length} shown</span>
        </div>

        <div className="sal-table-wrap">
          <table className="sal-table">
            <caption className="sal-sr-only">
              Contract requirements with required and placed limits, ratio, status and any
              override note
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: '17%' }}>
                  Site / asset
                </th>
                <th scope="col" style={{ width: '16%' }}>
                  Counterparty
                </th>
                <th scope="col" style={{ width: '12%' }}>
                  Coverage line
                </th>
                <th scope="col" className="sal-table__cell--right" style={{ width: '10%' }}>
                  Required
                </th>
                <th scope="col" className="sal-table__cell--right" style={{ width: '10%' }}>
                  Placed
                </th>
                <th scope="col" className="sal-table__cell--right" style={{ width: '7%' }}>
                  Ratio
                </th>
                <th scope="col" style={{ width: '10%' }}>
                  Status
                </th>
                <th scope="col" style={{ width: '18%' }}>
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td className="sal-table__empty" colSpan={8}>
                    <span className="sal-table__empty-title">No requirements in this view</span>
                    No requirement currently has this status.
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const id = row.requirement.id;
                  const expanded = expandedId === id;
                  const excluded = row.status === 'Excluded';

                  return (
                    <Fragment key={id}>
                      <tr
                        id={id}
                        data-clickable="true"
                        data-selected={expanded ? 'true' : undefined}
                        aria-expanded={expanded}
                        aria-controls={`requirement-detail-${id}`}
                        tabIndex={0}
                        onClick={() => toggle(id)}
                        onKeyDown={(event) => handleKeyDown(event, id)}
                        style={{ scrollMarginTop: 'calc(var(--topbar-h) + var(--space-lg))' }}
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
                          <td colSpan={8} style={detailCellStyle}>
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

const toolbarCountStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
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
  color: 'var(--crimson-deep)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
};
