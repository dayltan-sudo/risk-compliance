import { useEffect, useMemo, useRef } from 'react';
import type { JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH, project } from '../map/geo';
import { WorldDots } from '../map/WorldDots';
import { Card, Tag, bandColor, cn } from '../ui';
import { PageHeader } from '../components/PageHeader';
import { SiteDetail } from '../components/SiteDetail';
import { formatMoneyCompact } from '../components/format';
import { useFilteredPortfolio } from '../layout/filters';
import type { ScoredSite } from '../layout/filters';
import { formatSgd } from '../../engine';
import type { Band } from '../../engine';

interface Marker {
  entry: ScoredSite;
  x: number;
  y: number;
  r: number;
}

const CLUSTER_DISTANCE = 18;

/**
 * Markers are projected from the site's lon/lat. Sites that project on top of
 * each other (Singapore and Batam are 0.4° apart) are fanned deterministically
 * around their shared centroid so every one stays clickable.
 */
function buildMarkers(sites: readonly ScoredSite[]): Marker[] {
  const maxTiv = sites.reduce((max, entry) => Math.max(max, entry.site.tivSgd), 1);
  const points = sites.map((entry) => ({
    entry,
    point: project(entry.site.lon, entry.site.lat),
    r: 5 + 11 * Math.sqrt(entry.site.tivSgd / maxTiv),
  }));

  const groups: Array<{ anchor: { x: number; y: number }; members: typeof points }> = [];
  for (const point of points) {
    const group = groups.find(
      (candidate) =>
        Math.hypot(candidate.anchor.x - point.point.x, candidate.anchor.y - point.point.y) <
        CLUSTER_DISTANCE,
    );
    if (group === undefined) {
      groups.push({ anchor: point.point, members: [point] });
    } else {
      group.members.push(point);
    }
  }

  const markers: Marker[] = [];
  for (const group of groups) {
    if (group.members.length === 1) {
      const only = group.members[0];
      if (only !== undefined) {
        markers.push({ entry: only.entry, x: only.point.x, y: only.point.y, r: only.r });
      }
      continue;
    }

    const centre = group.members.reduce(
      (total, member) => ({
        x: total.x + member.point.x / group.members.length,
        y: total.y + member.point.y / group.members.length,
      }),
      { x: 0, y: 0 },
    );
    const spread = 24 + group.members.length * 6;
    group.members.forEach((member, index) => {
      const angle = (2 * Math.PI * index) / group.members.length - Math.PI / 2;
      markers.push({
        entry: member.entry,
        x: centre.x + Math.cos(angle) * spread,
        y: centre.y + Math.sin(angle) * spread,
        r: member.r,
      });
    });
  }

  // Larger markers first so the small ones stay on top and remain clickable.
  return markers.sort((a, b) => b.r - a.r);
}

const BANDS: Band[] = ['Low', 'Medium', 'High', 'Critical'];

function MapLegend() {
  return (
    <div className="sal-legend" aria-label="Risk band legend">
      {BANDS.map((value) => (
        <span key={value} className={cn('sal-legend__item', `sal-tone--${value.toLowerCase()}`)}>
          <span className="sal-legend__dot" aria-hidden="true" />
          {value}
        </span>
      ))}
    </div>
  );
}

export function GlobalMapPage(): JSX.Element {
  const { portfolio, sites, totalSites } = useFilteredPortfolio();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('site');
  const selectedRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const markers = useMemo(() => buildMarkers(sites), [sites]);

  useEffect(() => {
    // Scroll the list, never the page: the filter bar must stay where it is.
    const list = listRef.current;
    const row = selectedRef.current;
    if (list === null || row === null) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) {
      list.scrollTop -= listRect.top - rowRect.top;
    } else if (rowRect.bottom > listRect.bottom) {
      list.scrollTop += rowRect.bottom - listRect.bottom;
    }
  }, [selectedId]);

  const select = (siteId: string | null) => {
    const next = new URLSearchParams(params);
    if (siteId === null) next.delete('site');
    else next.set('site', siteId);
    setParams(next, { replace: true });
  };

  const countryCount = new Set(sites.map((entry) => entry.site.country)).size;
  const assetCount = portfolio.assets.length;
  const overviewHref = params.toString() === '' ? '/' : `/?${params.toString()}`;

  return (
    <div className="sal-page">
      <PageHeader
        eyebrow="Global map"
        title="Where the exposure sits"
        subtitle={`${sites.length} of ${totalSites} sites across ${countryCount} countries. Marker area is TIV; colour is the engine's risk band.`}
        actions={
          <Link className="sal-btn sal-btn--ghost" to={overviewHref}>
            Back to overview
          </Link>
        }
      />

      <div className="sal-map-layout">
        <div className="sal-map-layout__main">
          <Card
            className="sal-map-layout__map"
            title="World map"
            subtitle="Click a marker to open the site; the list stays in step."
            actions={<MapLegend />}
            padded={false}
          >
            <div className="sal-map__canvas">
              <WorldDots className="sal-map__dots" width={VIEWBOX_WIDTH} />
              <svg
                className="sal-map__overlay"
                viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
                role="group"
                aria-label="Sites plotted by location"
              >
                {markers.map(({ entry, x, y, r }) => {
                  const selected = entry.site.id === selectedId;
                  return (
                    <g
                      key={entry.site.id}
                      className={cn('sal-map__marker', selected && 'is-selected')}
                      role="button"
                      tabIndex={0}
                      aria-label={`${entry.site.name}, ${entry.band} risk, ${formatMoneyCompact(entry.site.tivSgd)} TIV`}
                      onClick={() => select(entry.site.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          select(entry.site.id);
                        }
                      }}
                    >
                      <title>
                        {`${entry.site.name} · ${entry.site.country}\n${entry.band} · TIV ${formatSgd(entry.site.tivSgd)}`}
                      </title>
                      <circle
                        className="sal-map__hit"
                        cx={x}
                        cy={y}
                        r={r + 7}
                        fill="transparent"
                      />
                      {selected ? (
                        <circle
                          className="sal-map__halo"
                          cx={x}
                          cy={y}
                          r={r + 5}
                          fill="none"
                          stroke="var(--crimson)"
                          strokeWidth={1.4}
                          strokeDasharray="3 3"
                        />
                      ) : null}
                      <circle
                        className="sal-map__dot"
                        cx={x}
                        cy={y}
                        r={r}
                        fill={bandColor(entry.band)}
                        stroke="var(--paper)"
                        strokeWidth={1.2}
                      />
                      <text
                        className="sal-map__label"
                        x={x}
                        y={y - r - 6}
                        textAnchor="middle"
                      >
                        {entry.site.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {sites.length === 0 ? (
                <p className="sal-map__empty">No sites match the current filters.</p>
              ) : null}
            </div>
          </Card>

          <SiteDetail siteId={selectedId} onClear={() => select(null)} />
        </div>

        <Card
          className="sal-map-layout__list"
          title="Sites"
          subtitle={`${sites.length} in view · ${assetCount} registered assets`}
          padded={false}
        >
          {sites.length === 0 ? (
            <p className="sal-empty sal-map__list-empty">
              No sites in view. Clear a filter to plot the portfolio.
            </p>
          ) : (
            <ul className="sal-assetlist" ref={listRef}>
              {sites.map((entry) => {
                const selected = entry.site.id === selectedId;
                return (
                  <li key={entry.site.id}>
                    <button
                      type="button"
                      className={cn('sal-asset', selected && 'is-selected')}
                      aria-pressed={selected}
                      ref={selected ? selectedRef : undefined}
                      onClick={() => select(entry.site.id)}
                    >
                      <span
                        className="sal-asset__dot"
                        style={{ background: bandColor(entry.band) }}
                        aria-hidden="true"
                      />
                      <span className="sal-asset__body">
                        <span className="sal-asset__name">{entry.site.name}</span>
                        <span className="sal-asset__meta">
                          {entry.site.city}, {entry.site.country} · {entry.site.assetClass}
                        </span>
                      </span>
                      <span className="sal-asset__value">
                        <span className="sal-mono">{formatMoneyCompact(entry.site.tivSgd)}</span>
                        <Tag tone={entry.band}>{entry.band}</Tag>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
