import { useMemo } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { formatSgd } from '../../engine';
import { Card, KpiTile } from '../ui';
import { buildCountryRows, CountryHeatGrid } from '../components/CountryHeatGrid';
import { ExceptionsCard } from '../components/ExceptionsCard';
import { buildExceptions } from '../components/exceptions';
import { formatMoneyCompact } from '../components/format';
import { PageHeader } from '../components/PageHeader';
import { useFilteredPortfolio } from '../layout/filters';

export function OverviewPage(): JSX.Element {
  const { portfolio, summary, sites, isFiltered, totalSites } = useFilteredPortfolio();
  const [params] = useSearchParams();
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
          info="TIV-weighted: sum of min(property limit, TIV) across sites, divided by sum of TIV."
        />
        <KpiTile
          label="Open gaps"
          value={summary.openGaps}
          tone={summary.openGaps > 0 ? 'bad' : 'good'}
          hint={`${summary.atRisk} at-risk · ${summary.excluded} excluded`}
          info="Contract requirements below the tolerance band. Exclusions are reported separately."
        />
        <KpiTile
          label="Renewals ≤ 60 days"
          value={summary.renewals.d60}
          tone={summary.renewals.d60 > 0 ? 'warn' : 'good'}
          hint={`Next 30d ${summary.renewals.d30} · next 60d ${summary.renewals.d60}`}
          info="Active policies expiring inside the window. Buckets are cumulative."
        />
        <KpiTile
          label="High / critical hotspots"
          value={hotspotCount}
          tone={criticalHotspots.length > 0 ? 'bad' : highHotspots.length > 0 ? 'warn' : 'good'}
          hint={`${criticalHotspots.length} critical · ${highHotspots.length} high, of the top five scored sites`}
          info="Risk band from the site score. The summary carries the five highest-scoring sites."
        />
        <KpiTile
          label="Group premium"
          value={formatMoneyCompact(summary.premiumSgd)}
          hint={`${formatSgd(summary.premiumSgd)} gross, active policies`}
          info="Gross premium converted to SGD at the latest FX rate on or before the config effective date."
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
        onSelect={(row) => navigate(hrefFor(row.siteId))}
        subtitle={`Requirement gaps, exclusions, renewals inside 60 days and under-insured sites. ${sites.length} sites in view.`}
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
