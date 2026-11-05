import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { daysBetween, formatSgd, toSgd } from '../../engine';
import type { Policy, Portfolio } from '../../engine';
import { PageHeader } from '../components/PageHeader';
import { formatDate } from '../components/format';
import { useFilteredPortfolio } from '../layout/filters';
import { Card, KpiTile, Tag } from '../ui';

/**
 * Renewal register.
 *
 * A row is a policy, not a site: "which policies expire before the meeting" is
 * a policy question, and the coverage pages answer the site question. Sorted by
 * expiry so the next renewal is the first line, with expired policies behind a
 * filter rather than at the top pretending to be work.
 */

export type RenewalBucket = 'd30' | 'd60' | 'd90' | 'later' | 'expired';

export interface RenewalRow {
  policy: Policy;
  entityName: string;
  carrierName: string;
  siteNames: string[];
  /** Whole days from the valuation date to expiry; negative once expired. */
  daysLeft: number;
  bucket: RenewalBucket;
  /** Gross annual premium in SGD, when the policy has a premium row. */
  premiumSgd: number | null;
}

export function bucketFor(daysLeft: number): RenewalBucket {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'd30';
  if (daysLeft <= 60) return 'd60';
  if (daysLeft <= 90) return 'd90';
  return 'later';
}

export function buildRenewalRows(portfolio: Portfolio, asOf: string): RenewalRow[] {
  return portfolio.policies
    .map((policy) => {
      const entity = portfolio.entities.find((candidate) => candidate.id === policy.entityId);
      const carrier = portfolio.carriers.find((candidate) => candidate.id === policy.carrierId);

      const siteNames = [
        ...new Set(
          portfolio.coverages
            .filter((coverage) => coverage.policyId === policy.id && coverage.validTo === null)
            .map(
              (coverage) =>
                portfolio.sites.find((site) => site.id === coverage.siteId)?.name ?? coverage.siteId,
            ),
        ),
      ];

      const premium = portfolio.premiums.find((candidate) => candidate.policyId === policy.id);
      const premiumSgd =
        premium === undefined
          ? null
          : toSgd(premium.gross, premium.currency, portfolio.fxRates, asOf);

      const daysLeft = daysBetween(asOf, policy.expiry);

      return {
        policy,
        entityName: entity?.name ?? policy.entityId,
        carrierName: carrier?.name ?? policy.carrierId,
        siteNames,
        daysLeft,
        bucket: bucketFor(daysLeft),
        premiumSgd,
      };
    })
    .sort((a, b) => {
      // Active policies first by soonest expiry, then expired ones, most recent first.
      const aExpired = a.bucket === 'expired';
      const bExpired = b.bucket === 'expired';
      if (aExpired !== bExpired) return aExpired ? 1 : -1;
      return aExpired ? b.policy.expiry.localeCompare(a.policy.expiry) : a.daysLeft - b.daysLeft;
    });
}

type Window = 'all' | 'd30' | 'd60' | 'd90' | 'expired';

const WINDOWS: ReadonlyArray<{ key: Window; label: string; long: string }> = [
  { key: 'all', label: 'All', long: 'All active policies' },
  { key: 'd30', label: '30d', long: 'Expiring within 30 days' },
  { key: 'd60', label: '60d', long: 'Expiring within 60 days' },
  { key: 'd90', label: '90d', long: 'Expiring within 90 days' },
  { key: 'expired', label: 'Expired', long: 'Already expired' },
];

export function filterByWindow(rows: readonly RenewalRow[], window: Window): RenewalRow[] {
  switch (window) {
    case 'expired':
      return rows.filter((row) => row.bucket === 'expired');
    case 'd30':
      return rows.filter((row) => row.bucket === 'd30');
    case 'd60':
      return rows.filter((row) => row.bucket === 'd30' || row.bucket === 'd60');
    case 'd90':
      return rows.filter(
        (row) => row.bucket === 'd30' || row.bucket === 'd60' || row.bucket === 'd90',
      );
    default:
      return rows.filter((row) => row.bucket !== 'expired');
  }
}

function daysLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d ago`;
  if (daysLeft === 0) return 'Today';
  return `${daysLeft}d`;
}

function daysTone(daysLeft: number): 'critical' | 'high' | 'medium' | 'neutral' {
  if (daysLeft < 0) return 'critical';
  if (daysLeft <= 30) return 'critical';
  if (daysLeft <= 60) return 'high';
  if (daysLeft <= 90) return 'medium';
  return 'neutral';
}

export function RenewalsPage() {
  const { portfolio, sites, totalSites } = useFilteredPortfolio();
  const asOf = portfolio.config.effectiveFrom;
  const [window, setWindow] = useState<Window>('all');

  const rows = useMemo(() => buildRenewalRows(portfolio, asOf), [portfolio, asOf]);
  const visible = useMemo(() => filterByWindow(rows, window), [rows, window]);

  const counts = useMemo(() => {
    const bucket = (key: RenewalBucket) => rows.filter((row) => row.bucket === key).length;
    const inWindow = (key: 'd30' | 'd60' | 'd90') => filterByWindow(rows, key).length;
    return {
      d30: inWindow('d30'),
      d60: inWindow('d60'),
      d90: inWindow('d90'),
      expired: bucket('expired'),
      later: bucket('later'),
    };
  }, [rows]);

  const premiumInWindow = useMemo(
    () =>
      filterByWindow(rows, 'd90').reduce((total, row) => total + (row.premiumSgd ?? 0), 0),
    [rows],
  );

  return (
    <div className="sal-page">
      <PageHeader
        eyebrow="Monitor · Renewals"
        title="Renewal register"
        subtitle={`Every policy in scope, soonest expiry first. Days are counted from ${formatDate(
          asOf,
        )}; expired policies sit behind their own filter rather than at the top of the list.`}
        actions={
          <a className="sal-btn" href="/api/export/policies.csv" download>
            Export policies CSV
          </a>
        }
      />

      <div style={kpiRowStyle}>
        <KpiTile label="Renewing ≤ 30 days" value={String(counts.d30)} hint="Active policies" />
        <KpiTile label="Renewing ≤ 60 days" value={String(counts.d60)} hint="Cumulative" />
        <KpiTile label="Renewing ≤ 90 days" value={String(counts.d90)} hint="Cumulative" />
        <KpiTile
          label="Premium in that window"
          value={formatSgd(premiumInWindow)}
          hint="Gross, SGD-equivalent"
        />
      </div>

      <Card
        title="Policies by expiry"
        subtitle={`${visible.length} of ${rows.length} policies in view · ${sites.length} of ${totalSites} sites in scope`}
        padded={false}
        actions={
          <div className="sal-seg" role="group" aria-label="Filter policies by renewal window">
            {WINDOWS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={window === option.key ? 'sal-seg__btn sal-seg__btn--active' : 'sal-seg__btn'}
                aria-pressed={window === option.key}
                aria-label={option.long}
                title={option.long}
                onClick={() => setWindow(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
        footer={`Premiums are gross annual, valued at ${formatDate(asOf)}. Expiry drives the window; nothing here is a forecast.`}
      >
        <table className="sal-table sal-table--dense">
          <caption className="sal-sr-only">
            Policies in scope with entity, line, carrier, covered sites, expiry, days remaining and
            annual premium
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Policy
              </th>
              <th scope="col">
                Entity
              </th>
              <th scope="col">
                Line
              </th>
              <th scope="col">
                Carrier
              </th>
              <th scope="col">
                Sites
              </th>
              <th scope="col">
                Expiry
              </th>
              <th scope="col" className="sal-table__cell--right">
                Days
              </th>
              <th scope="col" className="sal-table__cell--right">
                Premium
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className="sal-table__empty" colSpan={8}>
                  <span className="sal-table__empty-title">No policies in this window</span>
                  Nothing expires in the selected range for the current scope.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.policy.id} id={row.policy.id}>
                  <td>
                    <span className="sal-mono">{row.policy.policyNo}</span>
                  </td>
                  <td>{row.entityName}</td>
                  <td>{row.policy.line}</td>
                  <td>{row.carrierName}</td>
                  <td>
                    {row.siteNames.length === 0
                      ? '—'
                      : row.siteNames.length <= 2
                        ? row.siteNames.join(', ')
                        : `${row.siteNames.slice(0, 2).join(', ')} +${row.siteNames.length - 2}`}
                  </td>
                  <td>{formatDate(row.policy.expiry)}</td>
                  <td className="sal-table__cell--right">
                    <Tag tone={daysTone(row.daysLeft)}>{daysLabel(row.daysLeft)}</Tag>
                  </td>
                  <td className="sal-table__cell--right">
                    {row.premiumSgd === null ? '—' : formatSgd(row.premiumSgd)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const kpiRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 'var(--space-md)',
  marginBottom: 'var(--space-lg)',
};

export default RenewalsPage;
