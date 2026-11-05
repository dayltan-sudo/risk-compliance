import { Hono } from 'hono';

import { portfolio } from '../../src/data/portfolio';
import type { Portfolio } from '../../src/engine/types';
import { scopedPortfolio } from '../middleware/scope';
import { readSession } from './session';

/**
 * P7 CSV export.
 *
 * Mount this sub-app at the root: it owns the full `/api/export` prefix.
 *
 * Every export goes through `scopedPortfolio`, so the file a caller downloads
 * is the same book their session can see in the UI. An Entity Champion who
 * asks for policies gets one entity's rows, not the group's.
 */

const EXPORT_ENTITIES = ['policies', 'requirements', 'exclusions'] as const;
type ExportEntity = (typeof EXPORT_ENTITIES)[number];

type CsvValue = string | number | null | undefined;

/** RFC 4180 field: quote when the value carries a comma, quote or line break. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Header plus rows, CRLF-terminated, no thousands separators. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines: string[] = [header.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

const POLICY_HEADER = [
  'entity_id',
  'entity_name',
  'policy_id',
  'policy_no',
  'line',
  'carrier',
  'broker',
  'inception',
  'expiry',
  'currency',
  'status',
] as const;

const REQUIREMENT_HEADER = [
  'entity_id',
  'entity_name',
  'requirement_id',
  'site_id',
  'site_name',
  'counterparty_type',
  'counterparty',
  'agreement_ref',
  'clause_ref',
  'line',
  'peril',
  'required_limit',
  'currency',
  'tolerance',
] as const;

const EXCLUSION_HEADER = [
  'entity_id',
  'entity_name',
  'exclusion_id',
  'site_id',
  'site_name',
  'policy_no',
  'line',
  'scope',
  'peril',
  'sublimit',
  'currency',
  'clause_ref',
  'wording_excerpt',
] as const;

function lookupMaps(data: Portfolio) {
  return {
    entities: new Map(data.entities.map((entity) => [entity.id, entity])),
    sites: new Map(data.sites.map((site) => [site.id, site])),
    carriers: new Map(data.carriers.map((carrier) => [carrier.id, carrier])),
    brokers: new Map(data.brokers.map((broker) => [broker.id, broker])),
    policies: new Map(data.policies.map((policy) => [policy.id, policy])),
    coverages: new Map(data.coverages.map((coverage) => [coverage.id, coverage])),
  };
}

function policiesCsv(data: Portfolio): string {
  const maps = lookupMaps(data);

  const rows = data.policies.map((policy) => {
    const entity = maps.entities.get(policy.entityId);
    return [
      policy.entityId,
      entity?.name ?? '',
      policy.id,
      policy.policyNo,
      policy.line,
      maps.carriers.get(policy.carrierId)?.name ?? '',
      maps.brokers.get(policy.brokerId)?.name ?? '',
      policy.inception,
      policy.expiry,
      policy.currency,
      policy.status,
    ];
  });

  return toCsv(POLICY_HEADER, rows);
}

function requirementsCsv(data: Portfolio): string {
  const maps = lookupMaps(data);

  const rows = data.requirements.map((requirement) => {
    const site = maps.sites.get(requirement.siteId);
    const entity = site === undefined ? undefined : maps.entities.get(site.entityId);
    return [
      entity?.id ?? '',
      entity?.name ?? '',
      requirement.id,
      requirement.siteId,
      site?.name ?? '',
      requirement.counterpartyType,
      requirement.counterparty,
      requirement.agreementRef,
      requirement.clauseRef,
      requirement.line,
      requirement.peril,
      requirement.requiredLimit,
      requirement.currency,
      // The engine treats an omitted tolerance as 10%, so the export states
      // the effective value rather than leaving the column ambiguous.
      requirement.tolerance ?? 0.1,
    ];
  });

  return toCsv(REQUIREMENT_HEADER, rows);
}

function exclusionsCsv(data: Portfolio): string {
  const maps = lookupMaps(data);

  const rows = data.exclusions.map((exclusion) => {
    const site = maps.sites.get(exclusion.siteId);
    const entity = site === undefined ? undefined : maps.entities.get(site.entityId);
    const coverage = maps.coverages.get(exclusion.coverageId);
    const policy = coverage === undefined ? undefined : maps.policies.get(coverage.policyId);

    return [
      entity?.id ?? '',
      entity?.name ?? '',
      exclusion.id,
      exclusion.siteId,
      site?.name ?? '',
      policy?.policyNo ?? '',
      exclusion.line,
      exclusion.scope,
      exclusion.peril,
      exclusion.sublimit ?? '',
      coverage?.currency ?? '',
      exclusion.clauseRef,
      exclusion.wordingExcerpt,
    ];
  });

  return toCsv(EXCLUSION_HEADER, rows);
}

function isExportEntity(value: string): value is ExportEntity {
  return (EXPORT_ENTITIES as readonly string[]).includes(value);
}

export const exportRoutes = new Hono();

exportRoutes.get('/api/export/:entity.csv', async (c) => {
  // Hono parses the literal `.csv` suffix into the parameter key, so the
  // captured value is the whole file name (`policies.csv`), not the stem.
  const file = c.req.param()['entity.csv'] ?? '';
  const entity = file.endsWith('.csv') ? file.slice(0, -'.csv'.length) : '';

  if (!isExportEntity(entity)) {
    return c.json(
      {
        error: `unknown export "${file}"; expected policies.csv, requirements.csv or exclusions.csv`,
      },
      404,
    );
  }

  const data = scopedPortfolio(portfolio, await readSession(c));
  const body =
    entity === 'policies'
      ? policiesCsv(data)
      : entity === 'requirements'
        ? requirementsCsv(data)
        : exclusionsCsv(data);

  return c.body(body, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="salus-${entity}.csv"`,
    'Cache-Control': 'no-store',
  });
});
