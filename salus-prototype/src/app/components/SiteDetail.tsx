import { useEffect, useState } from 'react';

import { coverageLimitSgd, formatSgd, requirementStatus } from '../../engine';
import type { Coverage, Line, PolicyStatus, RequirementStatus } from '../../engine';
import { Card, DataTable, Tag } from '../ui';
import type { Column } from '../ui';
import { useFilteredPortfolio } from '../layout/filters';
import { formatDate, formatMoney, formatMoneyCompact, formatPct } from './format';

interface PolicyRow {
  coverageId: string;
  policyId: string;
  policyNo: string;
  line: Line;
  carrier: string;
  rating: string;
  limitSgd: number;
  expiry: string;
  status: PolicyStatus;
}

interface AssetRow {
  id: string;
  label: string;
  declaredValueSgd: number;
  valuationDate: string;
}

interface RequirementRow {
  id: string;
  counterparty: string;
  clauseRef: string;
  line: Line;
  requiredSgd: number;
  placedSgd: number;
  status: RequirementStatus;
}

const POLICY_COLUMNS: Array<Column<PolicyRow>> = [
  { key: 'policyNo', header: 'Policy' },
  { key: 'line', header: 'Line' },
  { key: 'carrier', header: 'Carrier' },
  {
    key: 'limitSgd',
    header: 'Limit',
    numeric: true,
    render: (row) => (
      <span title={formatSgd(row.limitSgd)}>{formatMoneyCompact(row.limitSgd)}</span>
    ),
  },
  { key: 'expiry', header: 'Expiry', render: (row) => formatDate(row.expiry) },
];

const REQUIREMENT_COLUMNS: Array<Column<RequirementRow>> = [
  { key: 'counterparty', header: 'Counterparty' },
  { key: 'line', header: 'Line' },
  {
    key: 'requiredSgd',
    header: 'Required',
    numeric: true,
    render: (row) => formatMoneyCompact(row.requiredSgd),
  },
  {
    key: 'placedSgd',
    header: 'Placed',
    numeric: true,
    render: (row) => formatMoneyCompact(row.placedSgd),
  },
  {
    key: 'status',
    header: 'Status',
    width: '92px',
    render: (row) => <Tag tone={row.status}>{row.status}</Tag>,
  },
];

const ASSET_COLUMNS: Array<Column<AssetRow>> = [
  { key: 'label', header: 'Asset' },
  {
    key: 'declaredValueSgd',
    header: 'Declared value',
    numeric: true,
    render: (row) => formatMoneyCompact(row.declaredValueSgd),
  },
  { key: 'valuationDate', header: 'Valued', render: (row) => formatDate(row.valuationDate) },
];

export interface SiteDetailProps {
  siteId: string | null;
  onClear: () => void;
}

/**
 * Site → policy drill. Selecting a policy row reveals its terms; the coverage
 * record, policy and premium are all looked up from the filtered portfolio.
 */
export function SiteDetail({ siteId, onClear }: SiteDetailProps) {
  const { portfolio, sites } = useFilteredPortfolio();
  const [openCoverageId, setOpenCoverageId] = useState<string | null>(null);

  useEffect(() => {
    setOpenCoverageId(null);
  }, [siteId]);

  const entry = sites.find((candidate) => candidate.site.id === siteId) ?? null;

  if (siteId === null) {
    return (
      <Card title="Site detail" subtitle="Drill from a site into its policies">
        <p className="sal-empty">
          Select a marker or a row in the site list to see exposure, assets, policies and contract
          requirements for that site.
        </p>
      </Card>
    );
  }

  if (entry === null) {
    return (
      <Card
        title="Site detail"
        subtitle="The selected site is outside the current filters"
        actions={
          <button type="button" className="sal-btn sal-btn--ghost sal-btn--sm" onClick={onClear}>
            Close
          </button>
        }
      >
        <p className="sal-empty">
          The site in the URL is not part of this filtered view. Widen a filter or pick another
          site from the list.
        </p>
      </Card>
    );
  }

  const site = entry.site;
  const entity = portfolio.entities.find((candidate) => candidate.id === site.entityId);
  const policyById = new Map(portfolio.policies.map((policy) => [policy.id, policy]));
  const carrierById = new Map(portfolio.carriers.map((carrier) => [carrier.id, carrier]));
  const brokerById = new Map(portfolio.brokers.map((broker) => [broker.id, broker]));

  const coveragesAtSite: Coverage[] = portfolio.coverages.filter(
    (coverage) => coverage.siteId === site.id,
  );

  const policyRows: PolicyRow[] = coveragesAtSite
    .map((coverage) => {
      const policy = policyById.get(coverage.policyId);
      if (policy === undefined) return null;
      const carrier = carrierById.get(policy.carrierId);
      return {
        coverageId: coverage.id,
        policyId: policy.id,
        policyNo: policy.policyNo,
        line: coverage.line,
        carrier: carrier?.name ?? policy.carrierId,
        rating: carrier?.rating ?? '—',
        limitSgd: coverageLimitSgd(coverage, portfolio),
        expiry: policy.expiry,
        status: policy.status,
      } satisfies PolicyRow;
    })
    .filter((row): row is PolicyRow => row !== null)
    .sort((a, b) =>
      a.status === b.status ? b.limitSgd - a.limitSgd : a.status === 'Active' ? -1 : 1,
    );

  const assetRows: AssetRow[] = portfolio.assets
    .filter((asset) => asset.siteId === site.id)
    .map((asset) => ({
      id: asset.id,
      label: asset.label,
      declaredValueSgd: asset.declaredValueSgd,
      valuationDate: asset.valuationDate,
    }));

  const requirementRows: RequirementRow[] = portfolio.requirements
    .filter((requirement) => requirement.siteId === site.id)
    .map((requirement) => {
      const assessment = requirementStatus(requirement, portfolio);
      return {
        id: requirement.id,
        counterparty: requirement.counterparty,
        clauseRef: requirement.clauseRef,
        line: requirement.line,
        requiredSgd: assessment.requiredSgd,
        placedSgd: assessment.placedSgd,
        status: assessment.status,
      } satisfies RequirementRow;
    });

  const openRow = policyRows.find((row) => row.coverageId === openCoverageId) ?? null;
  const openPolicy = openRow === null ? null : (policyById.get(openRow.policyId) ?? null);
  const openPremium =
    openPolicy === null
      ? undefined
      : portfolio.premiums.find((premium) => premium.policyId === openPolicy.id);
  const openBroker =
    openPolicy === null ? undefined : brokerById.get(openPolicy.brokerId);

  return (
    <Card
      title={site.name}
      subtitle={`${site.city}, ${site.country} · ${site.assetClass}${entity ? ` · ${entity.name}` : ''}`}
      actions={
        <>
          <Tag tone={entry.band}>{entry.band}</Tag>
          <button type="button" className="sal-btn sal-btn--ghost sal-btn--sm" onClick={onClear}>
            Close
          </button>
        </>
      }
    >
      <div className="sal-site">
        <div className="sal-site__col">
          <dl className="sal-facts">
            <div>
              <dt>Site score</dt>
              <dd className="sal-mono">{entry.score.toFixed(1)}</dd>
            </div>
            <div>
              <dt>TIV</dt>
              <dd className="sal-mono" title={formatSgd(site.tivSgd)}>
                {formatMoneyCompact(site.tivSgd)}
              </dd>
            </div>
            <div>
              <dt>Property cover</dt>
              <dd className="sal-mono" title={formatSgd(entry.coverSgd)}>
                {formatMoneyCompact(entry.coverSgd)}
              </dd>
            </div>
            <div>
              <dt>Insured to value</dt>
              <dd className="sal-mono">{formatPct(entry.tivCoverRatio * 100)}</dd>
            </div>
            <div>
              <dt>PML</dt>
              <dd className="sal-mono">{formatMoneyCompact(site.pmlSgd)}</dd>
            </div>
            <div>
              <dt>NatCat index</dt>
              <dd className="sal-mono">{site.natCatIndex}</dd>
            </div>
            <div>
              <dt>Country risk</dt>
              <dd className="sal-mono">{site.countryRiskIndex}</dd>
            </div>
            <div>
              <dt>Claims index</dt>
              <dd className="sal-mono">{site.claimsIndex}</dd>
            </div>
          </dl>

          <h4 className="sal-site__h4">Assets at this site</h4>
          <DataTable
            columns={ASSET_COLUMNS}
            rows={assetRows}
            rowKey={(row) => row.id}
            dense
            caption={`Assets at ${site.name}`}
            emptyTitle="No registered assets"
          />
        </div>

        <div className="sal-site__col">
          <h4 className="sal-site__h4">Policies</h4>
          <DataTable
            columns={POLICY_COLUMNS}
            rows={policyRows}
            rowKey={(row) => row.coverageId}
            selectedKey={openCoverageId}
            onRowClick={(row) =>
              setOpenCoverageId((current) => (current === row.coverageId ? null : row.coverageId))
            }
            dense
            caption={`Policies covering ${site.name}`}
            emptyTitle="No cover placed"
            emptyHint="This site has no coverage records in the current view."
          />

          {openRow !== null && openPolicy !== null ? (
            <div className="sal-policy">
              <div className="sal-policy__head">
                <span className="sal-policy__no">{openPolicy.policyNo}</span>
                <Tag tone={openPolicy.status === 'Active' ? 'low' : 'neutral'}>
                  {openPolicy.status}
                </Tag>
              </div>
              <p className="sal-policy__line">
                {openRow.line} · {openRow.carrier} ({openRow.rating}) · broker{' '}
                {openBroker?.name ?? openPolicy.brokerId}
              </p>
              <dl className="sal-policy__facts">
                <div>
                  <dt>Inception</dt>
                  <dd>{formatDate(openPolicy.inception)}</dd>
                </div>
                <div>
                  <dt>Expiry</dt>
                  <dd>{formatDate(openPolicy.expiry)}</dd>
                </div>
                <div>
                  <dt>Policy currency</dt>
                  <dd>{openPolicy.currency}</dd>
                </div>
                <div>
                  <dt>Premium</dt>
                  <dd>
                    {openPremium === undefined
                      ? 'Not recorded'
                      : `${formatMoney(openPremium.gross, openPremium.currency)} · ${openPremium.period}`}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          <h4 className="sal-site__h4">Contract requirements</h4>
          <DataTable
            columns={REQUIREMENT_COLUMNS}
            rows={requirementRows}
            rowKey={(row) => row.id}
            dense
            caption={`Contract requirements at ${site.name}`}
            emptyTitle="No contract requirements"
            emptyHint="No third-party limit requirement is recorded at this site."
          />
        </div>
      </div>
    </Card>
  );
}
