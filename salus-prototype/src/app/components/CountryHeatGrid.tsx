import { Link } from 'react-router-dom';

import type { Band } from '../../engine';
import { cn } from '../ui';
import type { ScoredSite } from '../layout/filters';
import { formatMoneyCompact, formatPct } from './format';

export interface CountryRow {
  country: string;
  band: Band;
  sites: number;
  tivSgd: number;
  insuredSgd: number;
  adequacyPct: number;
  topSiteId: string;
  topSiteName: string;
}

const BAND_RANK: Record<Band, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

/** Rolls the filtered sites up by country. Worst band wins; TIV breaks ties. */
export function buildCountryRows(sites: readonly ScoredSite[]): CountryRow[] {
  const grouped = new Map<string, ScoredSite[]>();
  for (const entry of sites) {
    const list = grouped.get(entry.site.country) ?? [];
    list.push(entry);
    grouped.set(entry.site.country, list);
  }

  const rows: CountryRow[] = [];
  for (const [country, entries] of grouped) {
    let tivSgd = 0;
    let insuredSgd = 0;
    let band: Band = 'Low';
    let top = entries[0];
    for (const entry of entries) {
      tivSgd += entry.site.tivSgd;
      insuredSgd += Math.min(entry.coverSgd, entry.site.tivSgd);
      if (BAND_RANK[entry.band] > BAND_RANK[band]) band = entry.band;
      if (top === undefined || entry.score > top.score) top = entry;
    }
    if (top === undefined) continue;

    rows.push({
      country,
      band,
      sites: entries.length,
      tivSgd,
      insuredSgd,
      adequacyPct: tivSgd > 0 ? (insuredSgd / tivSgd) * 100 : 0,
      topSiteId: top.site.id,
      topSiteName: top.site.name,
    });
  }

  rows.sort((a, b) =>
    BAND_RANK[b.band] !== BAND_RANK[a.band]
      ? BAND_RANK[b.band] - BAND_RANK[a.band]
      : b.tivSgd - a.tivSgd,
  );
  return rows;
}

export interface CountryHeatGridProps {
  rows: readonly CountryRow[];
  hrefFor: (siteId: string) => string;
}

/**
 * Country heat, coloured by the worst engine band in the country. The whole
 * cell is a link so a click drills to that country's highest-scoring site on
 * the map.
 */
export function CountryHeatGrid({ rows, hrefFor }: CountryHeatGridProps) {
  if (rows.length === 0) {
    return (
      <p className="sal-empty">
        No countries in view. Clear a filter to widen the portfolio.
      </p>
    );
  }

  return (
    <div className="sal-heat">
      {rows.map((row) => (
        <Link
          key={row.country}
          to={hrefFor(row.topSiteId)}
          className={cn('sal-heat__cell', `sal-tone--${row.band.toLowerCase()}`)}
          title={`${row.country}: ${row.sites} site${row.sites === 1 ? '' : 's'}, ${formatMoneyCompact(row.tivSgd)} TIV, ${formatPct(row.adequacyPct)} insured. Open ${row.topSiteName}.`}
        >
          <span className="sal-heat__country">{row.country}</span>
          <span className="sal-heat__band">{row.band}</span>
          <span className="sal-heat__meta">
            {row.sites} site{row.sites === 1 ? '' : 's'} · {formatMoneyCompact(row.tivSgd)}
          </span>
          <span className="sal-heat__meta">{formatPct(row.adequacyPct)} of TIV insured</span>
        </Link>
      ))}
    </div>
  );
}
