/**
 * Risk Hotspots (P3).
 *
 * Every site is scored by `scoreSite()`: eight 0-100 sub-scores, each weighted
 * and normalised by the engine. The table ranks the portfolio and names the
 * driver doing most of the work. Selecting a row opens the full breakdown as an
 * SVG bar chart, with the contribution sum reconciled against the score.
 *
 * The weight preview is deliberately local state: it re-runs `scoreSite()` with
 * adjusted weights so a reviewer can watch the ranking move, but it never
 * writes to the dated config version. Change-control is V2.
 */
import { useId, useMemo, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';

import { portfolio } from '../../data/portfolio';
import { DRIVERS, scoreSite } from '../../engine';
import type { Band, Driver, DriverScore, Portfolio, Site, SiteScore } from '../../engine';
import { Card, DataTable, Tag, bandColor, cn } from '../ui';
import type { Column } from '../ui';

/* ------------------------------------------------------------------ data seam */

/**
 * The page's only read of the portfolio. The shell replaces the body with the
 * filtered data from the global filter bar; every calculation below receives
 * `data` as an argument and never reaches for the module again.
 */
function loadPortfolio(): Portfolio {
  return portfolio;
}

/* --------------------------------------------------------------------- labels */

const BANDS: readonly Band[] = ['Low', 'Medium', 'High', 'Critical'];

const BAND_TONE = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical',
} as const;

const DRIVER_LABEL: Record<Driver, string> = {
  coverageGap: 'Coverage gap',
  underinsuredTiv: 'Under-insured TIV',
  natCat: 'Nat cat exposure',
  countryRisk: 'Country risk',
  claims: 'Claims history',
  carrier: 'Carrier quality',
  emerging: 'Emerging risk',
  mandatory: 'Mandatory line gap',
};

const DRIVER_NOTE: Record<Driver, string> = {
  coverageGap: 'Uninsured share of TIV, doubled and capped at 100.',
  underinsuredTiv: '100 × (1 − min(TIV cover, TIV) / TIV).',
  natCat: 'Stored nat-cat index for the site.',
  countryRisk: 'Stored country-risk index for the site.',
  claims: 'Stored claims index for the site.',
  carrier: 'Share of placed limit held by sub-investment-grade carriers.',
  emerging: 'No news feed in this prototype; structurally zero.',
  mandatory: '100 when an exposed line has no placed limit.',
};

/* -------------------------------------------------------------------- ranking */

type ScoredSite = {
  site: Site;
  entityName: string;
  score: SiteScore;
  topDriver: DriverScore | null;
  rank: number;
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function rankSites(data: Portfolio, weights: Record<Driver, number>): ScoredSite[] {
  const entityNames = new Map(data.entities.map((entity) => [entity.id, entity.name]));

  const scored = data.sites.map((site) => {
    const result = scoreSite(site, data, { weights });
    const topDriver = result.drivers.reduce<DriverScore | null>(
      (best, driver) =>
        best === null || driver.contribution > best.contribution ? driver : best,
      null,
    );

    return {
      site,
      entityName: entityNames.get(site.entityId) ?? site.entityId,
      score: result,
      topDriver,
    };
  });

  scored.sort((a, b) =>
    b.score.score !== a.score.score
      ? b.score.score - a.score.score
      : compareText(a.site.name, b.site.name),
  );

  return scored.map((row, index) => ({ ...row, rank: index + 1 }));
}

function countBands(rows: ScoredSite[]): Record<Band, number> {
  const counts: Record<Band, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  for (const row of rows) counts[row.score.band] += 1;
  return counts;
}

/* ----------------------------------------------------------------- formatting */

function pctText(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/* ---------------------------------------------------------------------- chart */

function DriverChart({ result }: { result: SiteScore }): JSX.Element {
  const generatedId = useId();
  const titleId = `sal-driver-chart-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const chartWidth = 460;
  const rowHeight = 26;
  const top = 22;
  const barX = 118;
  const barMax = 150;
  const height = top + result.drivers.length * rowHeight + 2;
  const maxContribution = Math.max(1, ...result.drivers.map((driver) => driver.contribution));
  const color = bandColor(result.band);
  const weakest = result.drivers.reduce<DriverScore | null>(
    (best, driver) =>
      best === null || driver.contribution > best.contribution ? driver : best,
    null,
  );

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${height}`}
      role="img"
      aria-labelledby={titleId}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <title id={titleId}>{`Driver contributions to a score of ${result.score.toFixed(2)}`}</title>

      <text
        x={0}
        y={10}
        fontFamily="var(--font-mono)"
        fontSize={8}
        letterSpacing=".06em"
        fill="var(--muted)"
      >
        DRIVER
      </text>
      <text
        x={300}
        y={10}
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontSize={8}
        letterSpacing=".06em"
        fill="var(--muted)"
      >
        SUB
      </text>
      <text
        x={370}
        y={10}
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontSize={8}
        letterSpacing=".06em"
        fill="var(--muted)"
      >
        WT
      </text>
      <text
        x={456}
        y={10}
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontSize={8}
        letterSpacing=".06em"
        fill="var(--muted)"
      >
        CONTRIB
      </text>

      {result.drivers.map((driver, index) => {
        const y = top + index * rowHeight;
        const isTop = weakest !== null && driver.driver === weakest.driver;
        const barWidth =
          maxContribution > 0 ? (driver.contribution / maxContribution) * barMax : 0;

        return (
          <g key={driver.driver}>
            <title>
              {`${DRIVER_LABEL[driver.driver]}: sub-score ${driver.subScore.toFixed(
                2,
              )}, weight ${pctText(driver.weight)}, contribution ${driver.contribution.toFixed(
                2,
              )}. ${DRIVER_NOTE[driver.driver]}`}
            </title>
            <text
              x={0}
              y={y + 9}
              fontFamily="var(--font-sans)"
              fontSize={9}
              fontWeight={isTop ? 700 : 400}
              fill="var(--ink)"
            >
              {DRIVER_LABEL[driver.driver]}
            </text>
            <rect x={barX} y={y} width={barMax} height={10} rx={2} fill="var(--paper)" />
            {driver.contribution > 0 ? (
              <rect
                x={barX}
                y={y}
                width={Math.max(barWidth, 1)}
                height={10}
                rx={2}
                fill={color}
                fillOpacity={isTop ? 0.95 : 0.5}
              />
            ) : null}
            <text
              x={300}
              y={y + 9}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize={9}
              fill="var(--muted)"
            >
              {driver.subScore.toFixed(1)}
            </text>
            <text
              x={370}
              y={y + 9}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize={9}
              fill="var(--muted)"
            >
              {pctText(driver.weight)}
            </text>
            <text
              x={456}
              y={y + 9}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize={9}
              fill="var(--ink)"
            >
              {driver.contribution.toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------- controls */

const GHOST_BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 13px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--line)',
  borderRadius: 'var(--radius-lg)',
  backgroundColor: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
};

function BandFilter({
  active,
  counts,
  onToggle,
}: {
  active: Band[];
  counts: Record<Band, number>;
  onToggle: (band: Band) => void;
}): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Filter by risk band"
      style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}
    >
      {BANDS.map((band) => {
        const selected = active.includes(band);
        return (
          <button
            key={band}
            type="button"
            className={cn('sal-tag', `sal-tone--${BAND_TONE[band]}`)}
            aria-pressed={selected}
            title={`${selected ? 'Hide' : 'Show'} ${band} sites`}
            onClick={() => onToggle(band)}
            style={{
              borderWidth: 0,
              opacity: selected ? 1 : 0.45,
              cursor: 'pointer',
            }}
          >
            <span className="sal-tag__dot" aria-hidden="true" />
            {band}
            <span className="sal-mono">{counts[band]}</span>
          </button>
        );
      })}
    </div>
  );
}

function WeightPreview({
  drivers,
  weights,
  baseWeights,
  onChange,
  onReset,
}: {
  drivers: Driver[];
  weights: Record<Driver, number>;
  baseWeights: Record<Driver, number>;
  onChange: (driver: Driver, value: number) => void;
  onReset: () => void;
}): JSX.Element {
  const generatedId = useId();
  const prefix = `sal-weight-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const previewActive = drivers.some((driver) => weights[driver] !== baseWeights[driver]);

  return (
    <Card
      title="Weight preview"
      subtitle="The three heaviest drivers are adjustable. Every site is re-scored with scoreSite() as a slider moves; the ranking below updates live."
      actions={
        <>
          <Tag tone={previewActive ? 'accent' : 'neutral'}>
            {previewActive ? 'Preview active' : 'Config weights'}
          </Tag>
          <button
            type="button"
            style={{
              ...GHOST_BUTTON,
              opacity: previewActive ? 1 : 0.45,
              cursor: previewActive ? 'pointer' : 'default',
            }}
            disabled={!previewActive}
            onClick={onReset}
          >
            Reset
          </button>
        </>
      }
      footer="Preview only. Slider values are held in browser state and never written to the dated config version. Weight change-control ships in V2."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xxl)' }}>
        {drivers.map((driver) => {
          const inputId = `${prefix}-${driver}`;
          const value = Math.round(weights[driver] * 100);
          const base = Math.round(baseWeights[driver] * 100);

          return (
            <div key={driver} style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 'var(--space-sm)',
                }}
              >
                <label
                  htmlFor={inputId}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-body)',
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  {DRIVER_LABEL[driver]}
                </label>
                <span className="sal-mono" style={{ fontSize: 'var(--text-body)' }}>
                  {value}%
                </span>
              </div>
              <input
                id={inputId}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value}
                aria-valuetext={`${value} percent`}
                onChange={(event) => onChange(driver, Number(event.target.value) / 100)}
                style={{ width: '100%', accentColor: 'var(--crimson)', margin: '6px 0 2px' }}
              />
              <div
                className="sal-mono"
                style={{
                  fontSize: 'var(--text-micro)',
                  letterSpacing: '.03em',
                  color: 'var(--muted)',
                }}
              >
                Config {base}%{value === base ? '' : ` → preview ${value}%`}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- cells */

function TopDriverCell({ row }: { row: ScoredSite }): JSX.Element {
  if (row.topDriver === null || row.topDriver.contribution <= 0) {
    return <span style={{ color: 'var(--muted)' }}>No material driver</span>;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span>{DRIVER_LABEL[row.topDriver.driver]}</span>
      <span className="sal-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
        +{row.topDriver.contribution.toFixed(2)}
      </span>
    </span>
  );
}

const COLUMNS: Array<Column<ScoredSite>> = [
  {
    key: 'rank',
    header: '#',
    numeric: true,
    width: '44px',
    render: (row) => String(row.rank).padStart(2, '0'),
  },
  {
    key: 'site',
    header: 'Site',
    width: '22%',
    render: (row) => <span style={{ fontWeight: 600 }}>{row.site.name}</span>,
  },
  { key: 'entity', header: 'Entity', width: '22%', render: (row) => row.entityName },
  { key: 'country', header: 'Country', width: '11%', render: (row) => row.site.country },
  {
    key: 'score',
    header: 'Score',
    numeric: true,
    width: '8%',
    render: (row) => (
      <span style={{ color: bandColor(row.score.band), fontWeight: 600 }}>
        {row.score.score.toFixed(2)}
      </span>
    ),
  },
  {
    key: 'band',
    header: 'Band',
    width: '10%',
    render: (row) => (
      <Tag tone={row.score.band} dot>
        {row.score.band}
      </Tag>
    ),
  },
  { key: 'driver', header: 'Top driver', width: '23%', render: (row) => <TopDriverCell row={row} /> },
];

/* ---------------------------------------------------------------- breakdown */

function DriverBreakdown({ row, total }: { row: ScoredSite; total: number }): JSX.Element {
  const sum = row.score.drivers.reduce((running, driver) => running + driver.contribution, 0);
  const balanced = Math.abs(sum - row.score.score) < 0.005;
  const top = row.topDriver;

  return (
    <Card
      title={row.site.name}
      subtitle={`${row.entityName} · ${row.site.country} · rank ${row.rank} of ${total}`}
      actions={
        <Tag tone={row.score.band} dot>
          {row.score.band}
        </Tag>
      }
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--space-lg)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              className="sal-mono"
              style={{
                fontSize: '28px',
                fontWeight: 600,
                lineHeight: 1.1,
                color: bandColor(row.score.band),
              }}
            >
              {row.score.score.toFixed(2)}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>/ 100</span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
            {top !== null && top.contribution > 0 ? (
              <>
                Top driver <strong>{DRIVER_LABEL[top.driver]}</strong> contributes{' '}
                {top.contribution.toFixed(2)} points.
              </>
            ) : (
              'No driver contributes a material share.'
            )}
          </p>
        </div>
        <Tag tone={balanced ? 'low' : 'critical'}>
          {balanced ? 'Σ = score' : 'Rounding drift'}
        </Tag>
      </div>

      <div style={{ marginTop: 'var(--space-lg)' }}>
        <DriverChart result={row.score} />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'var(--space-lg)',
          marginTop: 'var(--space-sm)',
          paddingTop: 'var(--space-sm)',
          borderTopWidth: '1px',
          borderTopStyle: 'solid',
          borderTopColor: 'var(--line)',
        }}
      >
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
          Σ contributions
        </span>
        <span className="sal-mono" style={{ fontSize: 'var(--text-body)' }}>
          {sum.toFixed(2)} = {row.score.score.toFixed(2)}
        </span>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 'var(--text-micro)', color: 'var(--muted)' }}>
        Sub-score is the driver on its 0–100 scale; weight is the normalised share actually used;
        contribution = sub-score × weight.
      </p>
    </Card>
  );
}

/* --------------------------------------------------------------------- header */

function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions: ReactNode;
}): JSX.Element {
  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 'var(--space-xl)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          className="sal-mono"
          style={{
            margin: 0,
            fontSize: 'var(--text-tiny)',
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          {eyebrow}
        </p>
        <h1 style={{ margin: '4px 0 0' }}>{title}</h1>
        <p
          style={{
            margin: '6px 0 0',
            maxWidth: '78ch',
            color: 'var(--muted)',
            fontSize: 'var(--text-body)',
          }}
        >
          {subtitle}
        </p>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: 'var(--space-sm)',
        }}
      >
        {actions}
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------------- csv */

function downloadCsv(filename: string, header: string[], rows: string[][]): void {
  if (typeof document === 'undefined') return;

  const escapeCell = (cell: string): string =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  const csv = [header, ...rows].map((line) => line.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportHotspotsCsv(
  rows: ScoredSite[],
  weights: Record<Driver, number>,
  previewDrivers: Driver[],
  refDate: string,
): void {
  const header = [
    'rank',
    'site',
    'entity',
    'country',
    'score',
    'band',
    'top_driver',
    'top_contribution',
    ...previewDrivers.map((driver) => `weight_${driver}`),
  ];
  const body = rows.map((row) => [
    String(row.rank),
    row.site.name,
    row.entityName,
    row.site.country,
    row.score.score.toFixed(2),
    row.score.band,
    row.topDriver?.driver ?? '',
    row.topDriver === null ? '' : row.topDriver.contribution.toFixed(2),
    ...previewDrivers.map((driver) => weights[driver].toFixed(4)),
  ]);

  downloadCsv(`risk-hotspots-${refDate}.csv`, header, body);
}

/* ----------------------------------------------------------------------- page */

export function HotspotsPage(): JSX.Element {
  const data = loadPortfolio();
  const refDate = data.config.effectiveFrom;
  const thresholds = data.config.thresholds;
  const baseWeights = data.config.weights;

  const previewDrivers = useMemo(
    () =>
      DRIVERS.filter((driver) => (baseWeights[driver] ?? 0) > 0)
        .sort((a, b) => (baseWeights[b] ?? 0) - (baseWeights[a] ?? 0))
        .slice(0, 3),
    [baseWeights],
  );

  const [weights, setWeights] = useState<Record<Driver, number>>(() => ({ ...baseWeights }));
  const [activeBands, setActiveBands] = useState<Band[]>([...BANDS]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ranked = useMemo(() => rankSites(data, weights), [data, weights]);
  const bandCounts = useMemo(() => countBands(ranked), [ranked]);
  const previewActive = previewDrivers.some((driver) => weights[driver] !== baseWeights[driver]);

  const visible = ranked.filter((row) => activeBands.includes(row.score.band));
  const active = visible.find((row) => row.site.id === selectedId) ?? visible[0] ?? null;

  const toggleBand = (band: Band): void => {
    setActiveBands((current) => {
      if (current.includes(band)) {
        return current.length === 1 ? current : current.filter((candidate) => candidate !== band);
      }
      return BANDS.filter((candidate) => current.includes(candidate) || candidate === band);
    });
  };

  return (
    <div className="sal-page">
      <PageHeader
        eyebrow="P3 · Risk"
        title="Risk hotspots"
        subtitle="Every site scored on the eight-driver model, ranked worst-first. The panel explains the score; the preview shows what a weight change would do without touching the config."
        actions={
          <button
            type="button"
            style={GHOST_BUTTON}
            onClick={() => exportHotspotsCsv(visible, weights, previewDrivers, refDate)}
          >
            Export CSV
          </button>
        }
      />

      <div
        style={{
          display: 'grid',
          gap: 'var(--space-section)',
        }}
      >
        <WeightPreview
          drivers={previewDrivers}
          weights={weights}
          baseWeights={baseWeights}
          onChange={(driver, value) =>
            setWeights((current) => ({ ...current, [driver]: value }))
          }
          onReset={() => setWeights({ ...baseWeights })}
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: 'var(--space-section)',
          }}
        >
          <div style={{ flex: '1 1 620px', minWidth: 0 }}>
            <Card
              title="Ranked sites"
              subtitle={`${ranked.length} sites scored on the ${DRIVERS.length}-driver model at config ${refDate}. ${
                previewActive ? 'Preview weights are active.' : 'Config weights are active.'
              }`}
              actions={
                <BandFilter active={activeBands} counts={bandCounts} onToggle={toggleBand} />
              }
              padded={false}
              footer={
                <>
                  Bands from config thresholds: Low &lt; {thresholds.bandMedium} · Medium{' '}
                  {thresholds.bandMedium}–&lt;{thresholds.bandHigh} · High {thresholds.bandHigh}–&lt;
                  {thresholds.bandCritical} · Critical ≥ {thresholds.bandCritical}. Click a row for
                  the driver breakdown.
                </>
              }
            >
              <DataTable
                columns={COLUMNS}
                rows={visible}
                rowKey={(row) => row.site.id}
                onRowClick={(row) => setSelectedId(row.site.id)}
                selectedKey={active?.site.id ?? null}
                dense
                caption="Sites ranked by risk score"
                emptyTitle="No sites in the selected bands"
                emptyHint="Re-enable a band chip to bring rows back."
              />
            </Card>
          </div>

          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            {active === null ? (
              <Card title="Driver breakdown">
                <p style={{ color: 'var(--muted)' }}>No site matches the selected bands.</p>
              </Card>
            ) : (
              <DriverBreakdown row={active} total={ranked.length} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
