import { useMemo } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { formatSgd } from '../../engine';
import { Card, KpiTile } from '../ui';
import { buildCountryRows, CountryHeatGrid } from '../components/CountryHeatGrid';
import { ExceptionsCard } from '../components/ExceptionsCard';
import { buildExceptions, describeExceptions } from '../components/exceptions';
import type { ExceptionRow } from '../components/exceptions';
import { formatMoneyCompact } from '../components/format';
import { PageHeader } from '../components/PageHeader';
import { useFilteredPortfolio } from '../layout/filters';

export function OverviewPage(): JSX.Element {
  const { portfolio, summary, sites, isFiltered, totalSites } = useFilteredPortfolio();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const exceptions = useMemo(() => buildExceptions(portfolio, sites), [portfolio, sites]);
  const countries = useMemo(() => buildCountryRows(sites), [sites]);

  const activePolicies = portfolio.policies.filter((policy) => policy.status === 'Active').length;
  const criticalHotspots = summary.hotspots.filter((hotspot) => hotspot.band === 'Critical');
  const highHotspots = summary.hotspots.filter((hotspot) => hotspot.band === 'High');
  const hotspotCount = criticalHotspots.length + highHotspots.length;

  const search = params.toString();
  const mapHref = search === '' ? '/map' : `/map?${search}`;
  const hrefFor = (siteId: string): string => {
    const next = new URLSearchParams(params);
    next.set('site', siteId);
    return `/map?${next.toString()}`;
  };

  // `?all=1` keeps the expanded table in a shared link, which is also how the
  // action rail opens the full queue.
  const expanded = params.get('all') === '1';
  const setExpanded = (next: boolean): void => {
    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set('all', '1');
    else nextParams.delete('all');
    setParams(nextParams);
  };

  // Map targets keep the current filter scope so the site opens in the same
  // slice; record links stay bare so the anchored row is never filtered out.
  const openRow = (row: ExceptionRow): void => {
    navigate(row.target === 'map' ? hrefFor(row.siteId) : row.href);
  };

  const gapCount = exceptions.filter((row) => row.kind === 'Requirement gap').length;
  const otherCount = exceptions.length - gapCount;
  const exceptionSubtitle =
    exceptions.length === 0
      ? `Nothing open across the ${sites.length} sites in view.`
      : `${exceptions.length} open items: ${describeExceptions(exceptions)}. Open gaps counts requirement gaps only; the other ${otherCount} items are why this queue is longer than that tile.`;

  const scopeNote = isFiltered
    ? `Filtered from ${totalSites} sites.`
    : 'Synthetic seed portfolio, no entity data.';

  return (
    <div className="sal-page">
      <PageHeader
        eyebrow="Group overview"
        title="Insurance adequacy at a glance"
        subtitle={
          <>
            {portfolio.entities.length} entities · {portfolio.sites.length} sites ·{' '}
            {activePolicies} active policies. {scopeNote}
          </>
        }
        actions={
          <Link className="sal-btn sal-btn--primary" to={mapHref}>
            Open global map
          </Link>
        }
      />

      <div className="sal-kpis">
        <KpiTile
          label="Coverage adequacy"
          value={summary.adequacyPct.toFixed(1)}
          unit="%"
          hint={`${formatMoneyCompact(summary.insuredSgd)} insured of ${formatMoneyCompact(summary.tivSgd)} TIV`}
          info="How much of what the sites are worth is actually covered by insurance: 100% means every dollar of value is insured. Formula: sum of min(property limit, TIV) across sites, divided by sum of TIV."
        />
        <KpiTile
          label="Open gaps"
          value={summary.openGaps}
          tone={summary.openGaps > 0 ? 'bad' : 'good'}
          hint={`${summary.atRisk} at-risk · ${summary.excluded} excluded`}
          info="Contract clauses that ask for more insurance than the group has in place. Exclusions and near renewals are counted separately, in the exceptions queue below."
        />
        <KpiTile
          label="Renewals ≤ 60 days"
          value={summary.renewals.d60}
          tone={summary.renewals.d60 > 0 ? 'warn' : 'good'}
          hint={`Next 30d ${summary.renewals.d30} · next 60d ${summary.renewals.d60}`}
          info="Active policies that run out within 60 days, so cover lapses unless they are re-placed. The 30-day figure sits inside the 60-day one, it is not extra."
        />
        <KpiTile
          label="High / critical hotspots"
          value={hotspotCount}
          tone={criticalHotspots.length > 0 ? 'bad' : highHotspots.length > 0 ? 'warn' : 'good'}
          hint={`${criticalHotspots.length} critical · ${highHotspots.length} high, of the top five scored sites`}
          info="Sites the risk model scores High or Critical. Only the five highest-scoring sites are scored into this tile, so it is a top-five reading, not a group total."
        />
        <KpiTile
          label="Group premium"
          value={formatMoneyCompact(summary.premiumSgd)}
          hint={`${formatSgd(summary.premiumSgd)} gross, active policies`}
          info="What the group pays in insurance premium across its active policies, in SGD. Formula: gross premium converted at the latest FX rate on or before the config effective date."
        />
      </div>

      <Card
        title="Country heat"
        subtitle={`${countries.length} countries in view · colour is the worst site band, click to drill into the map`}
      >
        <CountryHeatGrid rows={countries} hrefFor={hrefFor} />
      </Card>

      <ExceptionsCard
        rows={exceptions}
        expanded={expanded}
        onToggleExpanded={setExpanded}
        onSelect={openRow}
        subtitle={exceptionSubtitle}
        emptyHint={
          isFiltered
            ? 'Clear or widen a filter to bring items back into view.'
            : 'No open requirement gaps, near renewals or under-insured sites.'
        }
      />

      <p className="sal-page__foot">
        Every figure on this page is computed by the engine from the seeded portfolio; none is
        stored in the UI.
      </p>
    </div>
  );
}
