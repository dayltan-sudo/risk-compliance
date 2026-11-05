/**
 * Coverage Adequacy (P3).
 *
 * Answers three questions from the same engine ratios:
 *  - how much of each site's TIV is insured (`itv`, `coverageGapPct`);
 *  - whether the per-occurrence limit clears the PML (`limitToPml`);
 *  - whether business-interruption cover is adequate where it was assessed
 *    (`biAdequacy`).
 *
 * The site view is the audit spine. Entity and line views aggregate the same
 * Ratio objects rather than introducing a second calculation. Every row opens
 * a lineage panel showing numerator, denominator and formula.
 *
 * Data access is confined to `useFilteredPortfolio()`, so every figure here
 * follows the global filter bar.
 */
import { useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';

import {
  LINES,
  TIV_COVER_LINES,
  activeCoveragesForSite,
  biAdequacy,
  coverageGapPct,
  coverageLimitSgd,
  formatSgd,
  groupSummary,
  itv,
  limitToPml,
  toSgd,
} from '../../engine';
import type {
  Coverage,
  Currency,
  ItvRatio,
  PmlRatio,
  Portfolio,
  Ratio,
  Site,
  Thresholds,
} from '../../engine';
import { useFilteredPortfolio } from '../layout/filters';
import { Card, DataTable, KpiTile, Tag, cn } from '../ui';
import type { Column } from '../ui';

/* --------------------------------------------------------------------- types */

type View = 'site' | 'entity' | 'line';

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'site', label: 'By site' },
  { id: 'entity', label: 'By entity' },
  { id: 'line', label: 'By line' },
];

type BuildContext = {
  data: Portfolio;
  refDate: string;
  thresholds: Thresholds;
};

type AdequacyRow = {
  key: string;
  kind: View;
  label: string;
  entity: string;
  country: string;
  siteCount: number;
  tivSgd: number | null;
  sumInsuredSgd: number;
  itv: ItvRatio | null;
  pml: PmlRatio | null;
  gap: Ratio | null;
  bi: Ratio | null;
  biCurrency: Currency | null;
  coverages: Coverage[];
  note: string | null;
};

type LineageFlag = ItvRatio['flag'] | PmlRatio['flag'] | null;

type LineageRow = {
  key: string;
  coverage: string;
  site: string;
  measure: string;
  numerator: string;
  denominator: string;
  formula: string;
  value: string;
  flag: LineageFlag;
};

/* ----------------------------------------------------------------- formatting */

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function plainNumber(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function money(amount: number, currency: Currency): string {
  return `${currency} ${plainNumber(amount)}`;
}

function sgdCompact(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}bn`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (absolute >= 1_000) return `${Math.round(value / 1_000)}k`;
  return plainNumber(value);
}

function pctText(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function multipleText(value: number): string {
  return `${value.toFixed(2)}×`;
}

/** Tooltip that exposes the exact arithmetic behind a displayed ratio. */
function ratioTitle(ratio: Ratio, display: string): string {
  return `${plainNumber(ratio.numerator)} / ${plainNumber(ratio.denominator)} = ${display} · ${ratio.formula}`;
}

/* ---------------------------------------------------------------- aggregation */

/**
 * Aggregate an ITV from engine numerators. Single-coverage sites keep the
 * engine's own ratio verbatim; multi-coverage rows sum the numerators and reuse
 * the config thresholds for the flag, so the rule never leaves the engine's
 * configuration.
 */
function aggregateItv(
  numerator: number,
  denominator: number,
  thresholds: Thresholds,
): ItvRatio {
  const value = denominator > 0 ? numerator / denominator : 0;
  return {
    value,
    numerator,
    denominator,
    formula: 'Σ sumInsured (SGD) / Σ tivSgd',
    flag: value < thresholds.itvUnder ? 'under' : value > thresholds.itvOver ? 'over' : 'ok',
  };
}

/** Weakest BI ratio in a set; every returned object is an engine Ratio. */
function weakestBi(
  entries: Array<{ ratio: Ratio | null; currency: Currency | null }>,
): { ratio: Ratio; currency: Currency } | null {
  let weakest: { ratio: Ratio; currency: Currency } | null = null;
  for (const entry of entries) {
    if (entry.ratio === null || entry.currency === null) continue;
    if (weakest === null || entry.ratio.value < weakest.ratio.value) {
      weakest = { ratio: entry.ratio, currency: entry.currency };
    }
  }
  return weakest;
}

function sortAdequacy(rows: AdequacyRow[]): AdequacyRow[] {
  return rows.sort((a, b) => {
    if (a.gap === null || b.gap === null) {
      if (a.gap === null && b.gap === null) {
        return b.sumInsuredSgd - a.sumInsuredSgd || compareText(a.label, b.label);
      }
      return a.gap === null ? 1 : -1;
    }

    if (b.gap.value !== a.gap.value) return b.gap.value - a.gap.value;

    const itvA = a.itv?.value ?? Number.POSITIVE_INFINITY;
    const itvB = b.itv?.value ?? Number.POSITIVE_INFINITY;
    if (itvA !== itvB) return itvA - itvB;

    return compareText(a.label, b.label);
  });
}

/* ----------------------------------------------------------------- row builders */

function buildSiteRow(site: Site, ctx: BuildContext): AdequacyRow {
  const coverages = activeCoveragesForSite(site.id, ctx.data, ctx.refDate);
  const tivCoverages = coverages.filter((coverage) => TIV_COVER_LINES.includes(coverage.line));

  const parts = tivCoverages.map((coverage) =>
    itv(coverage, site.tivSgd, {
      fx: ctx.data.fxRates,
      refDate: ctx.refDate,
      thresholds: ctx.thresholds,
    }),
  );
  const sumInsuredSgd = parts.reduce((total, part) => total + part.numerator, 0);
  const itvRatio =
    parts.length === 1 && parts[0] !== undefined
      ? parts[0]
      : aggregateItv(sumInsuredSgd, site.tivSgd, ctx.thresholds);

  const limitSgd = tivCoverages.reduce(
    (total, coverage) => total + coverageLimitSgd(coverage, ctx.data, ctx.refDate),
    0,
  );

  const bi = weakestBi(
    tivCoverages.map((coverage) => ({
      ratio: biAdequacy(coverage),
      currency: coverage.currency,
    })),
  );

  const entity = ctx.data.entities.find((candidate) => candidate.id === site.entityId);

  return {
    key: `site:${site.id}`,
    kind: 'site',
    label: site.name,
    entity: entity?.name ?? site.entityId,
    country: site.country,
    siteCount: 1,
    tivSgd: site.tivSgd,
    sumInsuredSgd,
    itv: itvRatio,
    pml: limitToPml(limitSgd, site.pmlSgd),
    gap: coverageGapPct(site.tivSgd, sumInsuredSgd),
    bi: bi?.ratio ?? null,
    biCurrency: bi?.currency ?? null,
    coverages,
    note: tivCoverages.length === 0 ? 'No active TIV-covering coverage' : null,
  };
}

function buildSiteRows(data: Portfolio, ctx: BuildContext): AdequacyRow[] {
  return sortAdequacy(data.sites.map((site) => buildSiteRow(site, ctx)));
}

function buildEntityRows(data: Portfolio, ctx: BuildContext): AdequacyRow[] {
  const rows: AdequacyRow[] = [];

  for (const entity of data.entities) {
    const sites = data.sites.filter((site) => site.entityId === entity.id);
    if (sites.length === 0) continue;

    const siteRows = sites.map((site) => buildSiteRow(site, ctx));
    const tivSgd = siteRows.reduce((total, row) => total + (row.tivSgd ?? 0), 0);
    const sumInsuredSgd = siteRows.reduce((total, row) => total + row.sumInsuredSgd, 0);
    const limitSgd = siteRows.reduce((total, row) => total + (row.pml?.numerator ?? 0), 0);
    const pmlSgd = sites.reduce((total, site) => total + site.pmlSgd, 0);
    const bi = weakestBi(
      siteRows.map((row) => ({ ratio: row.bi, currency: row.biCurrency })),
    );

    rows.push({
      key: `entity:${entity.id}`,
      kind: 'entity',
      label: entity.name,
      entity: entity.name,
      country: entity.country,
      siteCount: sites.length,
      tivSgd,
      sumInsuredSgd,
      itv: aggregateItv(sumInsuredSgd, tivSgd, ctx.thresholds),
      pml: limitToPml(limitSgd, pmlSgd),
      gap: coverageGapPct(tivSgd, sumInsuredSgd),
      bi: bi?.ratio ?? null,
      biCurrency: bi?.currency ?? null,
      coverages: siteRows.flatMap((row) => row.coverages),
      note: null,
    });
  }

  return sortAdequacy(rows);
}

function buildLineRows(data: Portfolio, ctx: BuildContext): AdequacyRow[] {
  const activeBySite = new Map(
    data.sites.map((site) => [site.id, activeCoveragesForSite(site.id, data, ctx.refDate)]),
  );
  const rows: AdequacyRow[] = [];

  for (const line of LINES) {
    const entries = data.sites.flatMap((site) =>
      (activeBySite.get(site.id) ?? [])
        .filter((coverage) => coverage.line === line)
        .map((coverage) => ({ site, coverage })),
    );
    if (entries.length === 0) continue;

    const sites = entries
      .map((entry) => entry.site)
      .filter((site, index, all) => all.findIndex((candidate) => candidate.id === site.id) === index);
    const sumInsuredSgd = entries.reduce(
      (total, entry) =>
        total + toSgd(entry.coverage.sumInsured, entry.coverage.currency, data.fxRates, ctx.refDate),
      0,
    );
    const coverages = entries.map((entry) => entry.coverage);

    if (!TIV_COVER_LINES.includes(line)) {
      rows.push({
        key: `line:${line}`,
        kind: 'line',
        label: line,
        entity: 'Group',
        country: '—',
        siteCount: sites.length,
        tivSgd: null,
        sumInsuredSgd,
        itv: null,
        pml: null,
        gap: null,
        bi: null,
        biCurrency: null,
        coverages,
        note: 'Does not fund TIV',
      });
      continue;
    }

    const tivSgd = sites.reduce((total, site) => total + site.tivSgd, 0);
    const limitSgd = entries.reduce(
      (total, entry) => total + coverageLimitSgd(entry.coverage, data, ctx.refDate),
      0,
    );
    const pmlSgd = sites.reduce((total, site) => total + site.pmlSgd, 0);
    const bi = weakestBi(
      entries.map((entry) => ({
        ratio: biAdequacy(entry.coverage),
        currency: entry.coverage.currency,
      })),
    );

    rows.push({
      key: `line:${line}`,
      kind: 'line',
      label: line,
      entity: 'Group',
      country: '—',
      siteCount: sites.length,
      tivSgd,
      sumInsuredSgd,
      itv: aggregateItv(sumInsuredSgd, tivSgd, ctx.thresholds),
      pml: limitToPml(limitSgd, pmlSgd),
      gap: coverageGapPct(tivSgd, sumInsuredSgd),
      bi: bi?.ratio ?? null,
      biCurrency: bi?.currency ?? null,
      coverages,
      note: 'Funds TIV',
    });
  }

  return sortAdequacy(rows);
}

function buildRows(view: View, data: Portfolio, ctx: BuildContext): AdequacyRow[] {
  if (view === 'entity') return buildEntityRows(data, ctx);
  if (view === 'line') return buildLineRows(data, ctx);
  return buildSiteRows(data, ctx);
}

/* ------------------------------------------------------------------ cells */

const CELL_STACK: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 6,
};

const ITV_FLAG = {
  under: { tone: 'critical', label: 'Under' },
  ok: { tone: 'low', label: 'OK' },
  over: { tone: 'medium', label: 'Over' },
} as const;

const PML_FLAG = {
  below: { tone: 'critical', label: 'Below' },
  ok: { tone: 'low', label: 'Covered' },
} as const;

const FLAG_META = {
  under: { tone: 'critical', label: 'Under' },
  over: { tone: 'medium', label: 'Over' },
  ok: { tone: 'low', label: 'OK' },
  below: { tone: 'critical', label: 'Below 1.0' },
} as const;

function MoneyCell({ value }: { value: number }): JSX.Element {
  return <span title={formatSgd(value)}>{sgdCompact(value)}</span>;
}

function ItvCell({ ratio }: { ratio: ItvRatio | null }): JSX.Element {
  if (ratio === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const flag = ITV_FLAG[ratio.flag];
  return (
    <span style={CELL_STACK} title={ratioTitle(ratio, pctText(ratio.value))}>
      <span>{pctText(ratio.value)}</span>
      <Tag tone={flag.tone}>{flag.label}</Tag>
    </span>
  );
}

function PmlCell({ ratio }: { ratio: PmlRatio | null }): JSX.Element {
  if (ratio === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const flag = PML_FLAG[ratio.flag];
  return (
    <span style={CELL_STACK} title={ratioTitle(ratio, multipleText(ratio.value))}>
      <span>{multipleText(ratio.value)}</span>
      <Tag tone={flag.tone}>{flag.label}</Tag>
    </span>
  );
}

function GapCell({ ratio }: { ratio: Ratio | null }): JSX.Element {
  if (ratio === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  return (
    <span title={ratioTitle(ratio, pctText(ratio.value))}>{pctText(ratio.value)}</span>
  );
}

function BiCell({
  ratio,
  currency,
}: {
  ratio: Ratio | null;
  currency: Currency | null;
}): JSX.Element {
  if (ratio === null || currency === null) {
    return <span style={{ color: 'var(--muted)' }}>Not assessed</span>;
  }
  return (
    <span
      title={`${money(ratio.numerator, currency)} / ${money(ratio.denominator, currency)} = ${pctText(
        ratio.value,
      )} · ${ratio.formula}`}
    >
      {pctText(ratio.value)}
    </span>
  );
}

function FlagTag({ flag }: { flag: LineageFlag }): JSX.Element | null {
  if (flag === null) return null;
  const meta = FLAG_META[flag];
  return <Tag tone={meta.tone}>{meta.label}</Tag>;
}

/* ------------------------------------------------------------------ columns */

const SITE_COLUMNS: Array<Column<AdequacyRow>> = [
  {
    key: 'label',
    header: 'Site',
    width: '17%',
    render: (row) => <span style={{ fontWeight: 600 }}>{row.label}</span>,
  },
  { key: 'entity', header: 'Entity', width: '18%', render: (row) => row.entity },
  { key: 'country', header: 'Country', width: '10%', render: (row) => row.country },
  {
    key: 'tiv',
    header: 'TIV (SGD)',
    numeric: true,
    width: '10%',
    render: (row) => (row.tivSgd === null ? '—' : <MoneyCell value={row.tivSgd} />),
  },
  {
    key: 'sum',
    header: 'Sum insured (SGD)',
    numeric: true,
    width: '11%',
    render: (row) => <MoneyCell value={row.sumInsuredSgd} />,
  },
  {
    key: 'itv',
    header: 'ITV',
    numeric: true,
    width: '11%',
    render: (row) => <ItvCell ratio={row.itv} />,
  },
  {
    key: 'pml',
    header: 'Limit / PML',
    numeric: true,
    width: '11%',
    render: (row) => <PmlCell ratio={row.pml} />,
  },
  {
    key: 'gap',
    header: 'Gap',
    numeric: true,
    width: '6%',
    render: (row) => <GapCell ratio={row.gap} />,
  },
  {
    key: 'bi',
    header: 'BI',
    numeric: true,
    width: '10%',
    render: (row) => <BiCell ratio={row.bi} currency={row.biCurrency} />,
  },
];

const ENTITY_COLUMNS: Array<Column<AdequacyRow>> = [
  {
    key: 'label',
    header: 'Entity',
    width: '22%',
    render: (row) => <span style={{ fontWeight: 600 }}>{row.label}</span>,
  },
  { key: 'country', header: 'Country', width: '10%', render: (row) => row.country },
  {
    key: 'sites',
    header: 'Sites',
    numeric: true,
    width: '6%',
    render: (row) => row.siteCount,
  },
  {
    key: 'tiv',
    header: 'TIV (SGD)',
    numeric: true,
    width: '10%',
    render: (row) => (row.tivSgd === null ? '—' : <MoneyCell value={row.tivSgd} />),
  },
  {
    key: 'sum',
    header: 'Sum insured (SGD)',
    numeric: true,
    width: '11%',
    render: (row) => <MoneyCell value={row.sumInsuredSgd} />,
  },
  {
    key: 'itv',
    header: 'ITV',
    numeric: true,
    width: '11%',
    render: (row) => <ItvCell ratio={row.itv} />,
  },
  {
    key: 'pml',
    header: 'Limit / PML',
    numeric: true,
    width: '11%',
    render: (row) => <PmlCell ratio={row.pml} />,
  },
  {
    key: 'gap',
    header: 'Gap',
    numeric: true,
    width: '6%',
    render: (row) => <GapCell ratio={row.gap} />,
  },
  {
    key: 'bi',
    header: 'BI (weakest)',
    numeric: true,
    width: '13%',
    render: (row) => <BiCell ratio={row.bi} currency={row.biCurrency} />,
  },
];

const LINE_COLUMNS: Array<Column<AdequacyRow>> = [
  {
    key: 'label',
    header: 'Line',
    width: '16%',
    render: (row) => <span style={{ fontWeight: 600 }}>{row.label}</span>,
  },
  {
    key: 'sites',
    header: 'Sites',
    numeric: true,
    width: '6%',
    render: (row) => row.siteCount,
  },
  {
    key: 'tiv',
    header: 'TIV covered (SGD)',
    numeric: true,
    width: '11%',
    render: (row) => (row.tivSgd === null ? '—' : <MoneyCell value={row.tivSgd} />),
  },
  {
    key: 'sum',
    header: 'Sum insured (SGD)',
    numeric: true,
    width: '11%',
    render: (row) => <MoneyCell value={row.sumInsuredSgd} />,
  },
  {
    key: 'itv',
    header: 'ITV',
    numeric: true,
    width: '10%',
    render: (row) => <ItvCell ratio={row.itv} />,
  },
  {
    key: 'pml',
    header: 'Limit / PML',
    numeric: true,
    width: '11%',
    render: (row) => <PmlCell ratio={row.pml} />,
  },
  {
    key: 'gap',
    header: 'Gap',
    numeric: true,
    width: '6%',
    render: (row) => <GapCell ratio={row.gap} />,
  },
  {
    key: 'bi',
    header: 'BI (weakest)',
    numeric: true,
    width: '11%',
    render: (row) => <BiCell ratio={row.bi} currency={row.biCurrency} />,
  },
  {
    key: 'role',
    header: 'Role',
    width: '18%',
    render: (row) =>
      row.note === null ? null : row.note === 'Funds TIV' ? (
        <Tag tone="low">Funds TIV</Tag>
      ) : (
        <Tag tone="neutral">{row.note}</Tag>
      ),
  },
];

/* ------------------------------------------------------------------ lineage */

const LINEAGE_COLUMNS: Array<Column<LineageRow>> = [
  {
    key: 'measure',
    header: 'Measure',
    width: '16%',
    render: (row) => <span style={{ fontWeight: 600 }}>{row.measure}</span>,
  },
  { key: 'numerator', header: 'Numerator', numeric: true, width: '15%' },
  { key: 'denominator', header: 'Denominator', numeric: true, width: '15%' },
  {
    key: 'formula',
    header: 'Formula',
    width: '36%',
    render: (row) => (
      <span className="sal-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
        {row.formula}
      </span>
    ),
  },
  {
    key: 'value',
    header: 'Value',
    numeric: true,
    width: '12%',
    render: (row) => (
      <span style={CELL_STACK}>
        <span>{row.value}</span>
        <FlagTag flag={row.flag} />
      </span>
    ),
  },
];

const COVERAGE_LINEAGE_COLUMNS: Array<Column<LineageRow>> = [
  {
    key: 'coverage',
    header: 'Coverage',
    width: '16%',
    render: (row) => <span className="sal-mono">{row.coverage}</span>,
  },
  { key: 'site', header: 'Site', width: '14%' },
  { key: 'measure', header: 'Measure', width: '16%' },
  { key: 'numerator', header: 'Numerator', numeric: true, width: '11%' },
  { key: 'denominator', header: 'Denominator', numeric: true, width: '11%' },
  {
    key: 'formula',
    header: 'Formula',
    width: '22%',
    render: (row) => (
      <span className="sal-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
        {row.formula}
      </span>
    ),
  },
  {
    key: 'value',
    header: 'Value',
    numeric: true,
    width: '10%',
    render: (row) => (
      <span style={CELL_STACK}>
        <span>{row.value}</span>
        <FlagTag flag={row.flag} />
      </span>
    ),
  },
];

function buildAggregateLineage(row: AdequacyRow): LineageRow[] {
  const rows: LineageRow[] = [];

  if (row.itv !== null) {
    rows.push({
      key: `${row.key}:itv`,
      coverage: 'Row total',
      site: row.label,
      measure: 'ITV',
      numerator: formatSgd(row.itv.numerator),
      denominator: formatSgd(row.itv.denominator),
      formula: row.itv.formula,
      value: pctText(row.itv.value),
      flag: row.itv.flag,
    });
  }

  if (row.pml !== null) {
    rows.push({
      key: `${row.key}:pml`,
      coverage: 'Row total',
      site: row.label,
      measure: 'Limit-to-PML',
      numerator: formatSgd(row.pml.numerator),
      denominator: formatSgd(row.pml.denominator),
      formula: row.pml.formula,
      value: multipleText(row.pml.value),
      flag: row.pml.flag,
    });
  }

  if (row.gap !== null) {
    rows.push({
      key: `${row.key}:gap`,
      coverage: 'Row total',
      site: row.label,
      measure: 'Coverage gap',
      numerator: formatSgd(row.gap.numerator),
      denominator: formatSgd(row.gap.denominator),
      formula: row.gap.formula,
      value: pctText(row.gap.value),
      flag: null,
    });
  }

  if (row.bi !== null && row.biCurrency !== null) {
    rows.push({
      key: `${row.key}:bi`,
      coverage: 'Row total',
      site: row.label,
      measure: 'BI adequacy (weakest)',
      numerator: money(row.bi.numerator, row.biCurrency),
      denominator: money(row.bi.denominator, row.biCurrency),
      formula: row.bi.formula,
      value: pctText(row.bi.value),
      flag: null,
    });
  }

  return rows;
}

function buildCoverageLineage(row: AdequacyRow, ctx: BuildContext): LineageRow[] {
  const rows: LineageRow[] = [];
  const sitesById = new Map(ctx.data.sites.map((site) => [site.id, site]));

  for (const coverage of row.coverages) {
    const site = sitesById.get(coverage.siteId);
    const policy = ctx.data.policies.find((candidate) => candidate.id === coverage.policyId);
    const coverageLabel = `${coverage.id} · ${policy?.policyNo ?? coverage.policyId}`;
    const siteLabel = site?.name ?? coverage.siteId;

    if (site !== undefined && TIV_COVER_LINES.includes(coverage.line)) {
      const itvRatio = itv(coverage, site.tivSgd, {
        fx: ctx.data.fxRates,
        refDate: ctx.refDate,
        thresholds: ctx.thresholds,
      });
      rows.push({
        key: `${coverage.id}:itv`,
        coverage: coverageLabel,
        site: siteLabel,
        measure: `ITV · ${coverage.line}`,
        numerator: formatSgd(itvRatio.numerator),
        denominator: formatSgd(itvRatio.denominator),
        formula: itvRatio.formula,
        value: pctText(itvRatio.value),
        flag: itvRatio.flag,
      });

      const limitSgd = coverageLimitSgd(coverage, ctx.data, ctx.refDate);
      const pmlRatio = limitToPml(limitSgd, site.pmlSgd);
      rows.push({
        key: `${coverage.id}:pml`,
        coverage: coverageLabel,
        site: siteLabel,
        measure: `Limit-to-PML · ${coverage.line}`,
        numerator: formatSgd(pmlRatio.numerator),
        denominator: formatSgd(pmlRatio.denominator),
        formula: pmlRatio.formula,
        value: multipleText(pmlRatio.value),
        flag: pmlRatio.flag,
      });
    } else {
      rows.push({
        key: `${coverage.id}:na`,
        coverage: coverageLabel,
        site: siteLabel,
        measure: `ITV · ${coverage.line}`,
        numerator: '—',
        denominator: '—',
        formula: 'Not a TIV-covering line; no adequacy ratio applies.',
        value: 'n/a',
        flag: null,
      });
    }

    const bi = biAdequacy(coverage);
    if (bi !== null) {
      rows.push({
        key: `${coverage.id}:bi`,
        coverage: coverageLabel,
        site: siteLabel,
        measure: `BI adequacy · ${coverage.line}`,
        numerator: money(bi.numerator, coverage.currency),
        denominator: money(bi.denominator, coverage.currency),
        formula: bi.formula,
        value: pctText(bi.value),
        flag: null,
      });
    }
  }

  return rows;
}

const SECTION_TITLE: CSSProperties = {
  margin: '0 0 8px',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-base)',
  fontWeight: 700,
  color: 'var(--ink)',
};

function LineageCard({ row, ctx }: { row: AdequacyRow; ctx: BuildContext }): JSX.Element {
  const totals = buildAggregateLineage(row);
  const coverageRows = buildCoverageLineage(row, ctx);

  return (
    <Card
      title="Calculation lineage"
      subtitle={`Numerator, denominator and formula behind ${row.label}. Every figure resolves to an active coverage and a policy row.`}
      actions={<Tag tone="accent">{row.key.replace(':', ' · ')}</Tag>}
      footer={`itv = sumInsured / tivSgd · limitToPml = limitOcc / pmlSgd · coverageGapPct = max(0, TIV − sumInsured) / TIV · biAdequacy = biSumInsured / annualGrossProfit. FX uses the latest rate on or before ${ctx.refDate}.`}
    >
      <h3 style={SECTION_TITLE}>Row totals</h3>
      <DataTable
        columns={LINEAGE_COLUMNS}
        rows={totals}
        rowKey={(lineage) => lineage.key}
        dense
        caption={`Ratio lineage for ${row.label}`}
      />

      <h3 style={{ ...SECTION_TITLE, marginTop: 'var(--space-xxl)' }}>Underlying coverage rows</h3>
      <DataTable
        columns={COVERAGE_LINEAGE_COLUMNS}
        rows={coverageRows}
        rowKey={(lineage) => lineage.key}
        dense
        emptyTitle="No active coverage"
        emptyHint="This row has no active coverage at the effective date."
      />
    </Card>
  );
}

/* --------------------------------------------------------------------- header */

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

function exportCoverageCsv(view: View, rows: AdequacyRow[], refDate: string): void {
  const header = [
    'view',
    'row',
    'entity',
    'country',
    'sites',
    'tiv_sgd',
    'sum_insured_sgd',
    'itv',
    'itv_flag',
    'limit_to_pml',
    'pml_flag',
    'coverage_gap',
    'bi_adequacy',
    'bi_currency',
    'coverage_ids',
  ];
  const body = rows.map((row) => [
    view,
    row.label,
    row.entity,
    row.country,
    String(row.siteCount),
    row.tivSgd === null ? '' : String(row.tivSgd),
    String(row.sumInsuredSgd),
    row.itv === null ? '' : row.itv.value.toFixed(6),
    row.itv?.flag ?? '',
    row.pml === null ? '' : row.pml.value.toFixed(6),
    row.pml?.flag ?? '',
    row.gap === null ? '' : row.gap.value.toFixed(6),
    row.bi === null ? '' : row.bi.value.toFixed(6),
    row.biCurrency ?? '',
    row.coverages.map((coverage) => coverage.id).join(' '),
  ]);

  downloadCsv(`coverage-adequacy-${view}-${refDate}.csv`, header, body);
}

/* ----------------------------------------------------------------------- page */

const KPI_STRIP: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-lg)',
};

export function CoveragePage(): JSX.Element {
  const { portfolio: data } = useFilteredPortfolio();
  const refDate = data.config.effectiveFrom;
  const thresholds = data.config.thresholds;
  const ctx: BuildContext = { data, refDate, thresholds };

  const [view, setView] = useState<View>('site');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const siteRows = buildSiteRows(data, ctx);
  const rows = buildRows(view, data, ctx);
  const summary = groupSummary(data);

  const underItv = siteRows.filter((row) => row.itv?.flag === 'under').length;
  const belowPml = siteRows.filter((row) => row.pml?.flag === 'below').length;
  const tivExposed = summary.tivSgd - summary.insuredSgd;
  const adequacyTone =
    summary.adequacyPct >= 95 ? 'good' : summary.adequacyPct >= 90 ? 'warn' : 'bad';

  const active = rows.find((row) => row.key === selectedKey) ?? rows[0] ?? null;
  const columns =
    view === 'site' ? SITE_COLUMNS : view === 'entity' ? ENTITY_COLUMNS : LINE_COLUMNS;

  return (
    <div className="sal-page">
      <PageHeader
        eyebrow="P3 · Coverage"
        title="Coverage adequacy"
        subtitle="Sum insured against TIV, per-occurrence limit against PML, and business-interruption cover where it was assessed. All values in SGD at the config effective date."
        actions={
          <>
            <div className="sal-seg" role="group" aria-label="Aggregate coverage by">
              <span className="sal-seg__label" aria-hidden="true">
                View
              </span>
              {VIEWS.map((option) => {
                const selected = option.id === view;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={cn('sal-seg__btn', selected && 'sal-seg__btn--active')}
                    aria-pressed={selected}
                    onClick={() => setView(option.id)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              style={GHOST_BUTTON}
              onClick={() => exportCoverageCsv(view, rows, refDate)}
            >
              Export CSV
            </button>
          </>
        }
      />

      <div
        style={{
          display: 'grid',
          gap: 'var(--space-section)',
        }}
      >
        <div style={KPI_STRIP}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <KpiTile
              label="TIV-weighted adequacy"
              value={summary.adequacyPct.toFixed(1)}
              unit="%"
              hint={`${formatSgd(summary.insuredSgd)} of ${formatSgd(summary.tivSgd)} TIV`}
              info="Sum of min(property limit, site TIV) divided by group TIV, from groupSummary()."
              tone={adequacyTone}
            />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <KpiTile
              label={`Sites under ${pctText(thresholds.itvUnder, 0)} ITV`}
              value={underItv}
              hint={`of ${data.sites.length} sites`}
              info="Sites whose itv().flag is 'under' at the configured threshold."
              tone={underItv > 0 ? 'warn' : 'good'}
            />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <KpiTile
              label="Sites below limit-to-PML"
              value={belowPml}
              hint="per-occurrence limit under site PML"
              info="Sites whose limitToPml().flag is 'below'."
              tone={belowPml > 0 ? 'warn' : 'good'}
            />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <KpiTile
              label="TIV exposed by the gap"
              value={`SGD ${sgdCompact(tivExposed)}`}
              hint="uninsured TIV, capped per site"
              info={formatSgd(tivExposed)}
              tone={tivExposed > 0 ? 'bad' : 'good'}
            />
          </div>
        </div>

        <Card
          title={`Coverage by ${view}`}
          subtitle={`Active coverages at ${refDate}. Entity and line views aggregate the same engine ratios as the site view.`}
          actions={<Tag tone="neutral">{rows.length} rows</Tag>}
          padded={false}
          footer={
            <>
              Ordered worst-first by coverage gap, then ITV. {underItv} of {data.sites.length} sites
              are under the {pctText(thresholds.itvUnder, 0)} ITV threshold and {belowPml} sit below
              1.0× limit-to-PML. Select a row for numerator, denominator and formula. ITV uses sum
              insured without a TIV cap; the adequacy KPI caps each site at its TIV.
              {view === 'line'
                ? ' A site can be covered by more than one TIV line, so line-level gaps are not additive.'
                : ''}
            </>
          }
        >
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.key}
            onRowClick={(row) => setSelectedKey(row.key)}
            selectedKey={active?.key ?? null}
            dense
            caption={`Coverage adequacy by ${view}`}
            emptyTitle="No coverage rows"
            emptyHint="No active coverage at the effective date."
          />
        </Card>

        {active === null ? null : <LineageCard row={active} ctx={ctx} />}
      </div>
    </div>
  );
}
