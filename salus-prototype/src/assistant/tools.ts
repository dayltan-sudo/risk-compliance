/**
 * Read-only tools for the Salus Assistant.
 *
 * Every function is pure: it reads the in-memory seed portfolio and returns
 * records plus `refs` for the records those rows came from. The assistant may
 * only make claims from these results, and every figure in an answer must
 * resolve to one of the returned refs. No I/O, no model calls, no clock.
 *
 * Amounts are in SGD unless the row carries a `currency` field. Tool results
 * are serialised straight to the model, so field names are part of the
 * contract.
 */
import { portfolio } from '../data/portfolio';
import { addDays, daysBetween, isIsoDate } from '../engine/dates';
import { toSgd } from '../engine/fx';
import { activeCoveragesForSite, formatSgd, requirementStatus } from '../engine/requirements';
import { round2, scoreSite } from '../engine/scoring';
import { groupSummary } from '../engine/summary';
import type { CounterpartyType, Line, RequirementStatus } from '../engine/types';
import { LINES } from '../engine/types';

export const TOOL_NAMES = [
  'getKpis',
  'findPolicies',
  'listRequirements',
  'explainScore',
  'listRenewals',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type RefType =
  | 'kpi'
  | 'policy'
  | 'requirement'
  | 'site'
  | 'entity'
  | 'carrier'
  | 'coverage'
  | 'premium'
  | 'score'
  | 'driver';

export type ToolRef = {
  type: RefType;
  id: string;
  label: string;
};

/** A record always carries the id the answer can cite. */
export type ToolRecord = { id: string; [key: string]: unknown };

export type ToolResult = {
  tool: ToolName;
  records: ToolRecord[];
  refs: ToolRef[];
};

export type ToolSpec = {
  name: ToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
};

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

const REQUIREMENT_STATUSES: readonly RequirementStatus[] = ['Met', 'At-risk', 'Gap', 'Excluded'];
const COUNTERPARTY_TYPES: readonly CounterpartyType[] = [
  'Customer/Tenant',
  'Lender',
  'JV Partner',
  'Government/Concession',
];
const MAX_WINDOW_DAYS = 3650;

const KPI_LABELS: Record<string, string> = {
  'kpi-tiv': 'Group TIV (SGD)',
  'kpi-insured': 'Insured value against TIV (SGD)',
  'kpi-adequacy': 'TIV adequacy (%)',
  'kpi-premium': 'Active annual premium (SGD)',
  'kpi-requirements-total': 'Contract requirements assessed',
  'kpi-gaps': 'Open contract gaps',
  'kpi-at-risk': 'At-risk contract requirements',
  'kpi-excluded': 'Requirements excluded by wording',
  'kpi-renewals-30': 'Policies expiring within 30 days',
  'kpi-renewals-60': 'Policies expiring within 60 days',
  'kpi-renewals-90': 'Policies expiring within 90 days',
};

export function refKey(ref: ToolRef): string {
  return `${ref.type}:${ref.id}`;
}

function ref(type: RefType, id: string, label: string): ToolRef {
  return { type, id, label };
}

function uniqueRefs(refs: ToolRef[]): ToolRef[] {
  const seen = new Set<string>();
  const unique: ToolRef[] = [];
  for (const entry of refs) {
    const key = refKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

function siteLabel(siteId: string): string {
  const site = portfolio.sites.find((candidate) => candidate.id === siteId);
  return site === undefined ? `Site ${siteId}` : `Site ${site.id} ${site.name}`;
}

/**
 * Group summary figures. `period` drives the renewal windows; money is always
 * valued at the config effective date, matching `groupSummary`. Every record
 * lists the ids its value was computed from.
 */
export function getKpis(period: string = portfolio.config.effectiveFrom): ToolResult {
  if (!isIsoDate(period)) {
    throw new ToolError(`period must be an ISO date (YYYY-MM-DD), received ${JSON.stringify(period)}`);
  }

  const valuationDate = portfolio.config.effectiveFrom;
  const summary = groupSummary(portfolio, period);
  const siteIds = portfolio.sites.map((site) => site.id);

  const requirementIdsByStatus = (statuses: readonly RequirementStatus[]): string[] =>
    portfolio.requirements
      .filter((requirement) =>
        statuses.includes(requirementStatus(requirement, portfolio, valuationDate).status),
      )
      .map((requirement) => requirement.id);

  const activePolicyIds = new Set(
    portfolio.policies.filter((policy) => policy.status === 'Active').map((policy) => policy.id),
  );
  const premiumIds = portfolio.premiums
    .filter((premium) => activePolicyIds.has(premium.policyId))
    .map((premium) => premium.id);

  const renewalPolicyIds = (days: number): string[] =>
    portfolio.policies
      .filter(
        (policy) =>
          policy.status === 'Active' && policy.expiry > period && policy.expiry <= addDays(period, days),
      )
      .map((policy) => policy.id);

  const records: ToolRecord[] = [
    {
      id: 'kpi-tiv',
      kind: 'kpi',
      metric: 'tivSgd',
      value: summary.tivSgd,
      unit: 'SGD',
      asOf: period,
      valuationDate,
      sourceIds: siteIds,
    },
    {
      id: 'kpi-insured',
      kind: 'kpi',
      metric: 'insuredSgd',
      value: summary.insuredSgd,
      unit: 'SGD',
      asOf: period,
      valuationDate,
      sourceIds: siteIds,
    },
    {
      id: 'kpi-adequacy',
      kind: 'kpi',
      metric: 'adequacyPct',
      value: summary.adequacyPct,
      unit: '%',
      asOf: period,
      valuationDate,
      sourceIds: siteIds,
    },
    {
      id: 'kpi-premium',
      kind: 'kpi',
      metric: 'premiumSgd',
      value: summary.premiumSgd,
      unit: 'SGD',
      asOf: period,
      valuationDate,
      sourceIds: premiumIds,
    },
    {
      id: 'kpi-requirements-total',
      kind: 'kpi',
      metric: 'requirementCounts.total',
      value: summary.requirementCounts.total,
      unit: 'requirements',
      asOf: period,
      valuationDate,
      sourceIds: portfolio.requirements.map((requirement) => requirement.id),
    },
    {
      id: 'kpi-gaps',
      kind: 'kpi',
      metric: 'openGaps',
      value: summary.openGaps,
      unit: 'requirements',
      asOf: period,
      valuationDate,
      sourceIds: requirementIdsByStatus(['Gap']),
    },
    {
      id: 'kpi-at-risk',
      kind: 'kpi',
      metric: 'atRisk',
      value: summary.atRisk,
      unit: 'requirements',
      asOf: period,
      valuationDate,
      sourceIds: requirementIdsByStatus(['At-risk']),
    },
    {
      id: 'kpi-excluded',
      kind: 'kpi',
      metric: 'excluded',
      value: summary.excluded,
      unit: 'requirements',
      asOf: period,
      valuationDate,
      sourceIds: requirementIdsByStatus(['Excluded']),
    },
    {
      id: 'kpi-renewals-30',
      kind: 'kpi',
      metric: 'renewals.d30',
      value: summary.renewals.d30,
      unit: 'policies',
      asOf: period,
      valuationDate,
      sourceIds: renewalPolicyIds(30),
    },
    {
      id: 'kpi-renewals-60',
      kind: 'kpi',
      metric: 'renewals.d60',
      value: summary.renewals.d60,
      unit: 'policies',
      asOf: period,
      valuationDate,
      sourceIds: renewalPolicyIds(60),
    },
    {
      id: 'kpi-renewals-90',
      kind: 'kpi',
      metric: 'renewals.d90',
      value: summary.renewals.d90,
      unit: 'policies',
      asOf: period,
      valuationDate,
      sourceIds: renewalPolicyIds(90),
    },
  ];

  const refs: ToolRef[] = records.map((record) =>
    ref('kpi', record.id, KPI_LABELS[record.id] ?? `Summary figure ${record.id}`),
  );

  const sitesById = new Map(portfolio.sites.map((site) => [site.id, site]));
  const requirementsById = new Map(
    portfolio.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const premiumsById = new Map(portfolio.premiums.map((premium) => [premium.id, premium]));
  const policiesById = new Map(portfolio.policies.map((policy) => [policy.id, policy]));

  for (const record of records) {
    const sourceIds = record.sourceIds;
    if (!Array.isArray(sourceIds)) continue;
    for (const rawId of sourceIds) {
      if (typeof rawId !== 'string') continue;

      const site = sitesById.get(rawId);
      if (site !== undefined) {
        refs.push(ref('site', site.id, `Site ${site.id} ${site.name}`));
        continue;
      }
      const requirement = requirementsById.get(rawId);
      if (requirement !== undefined) {
        refs.push(ref('requirement', requirement.id, `Requirement ${requirement.id} (${requirement.line})`));
        continue;
      }
      const premium = premiumsById.get(rawId);
      if (premium !== undefined) {
        refs.push(ref('premium', premium.id, `Premium ${premium.id} (policy ${premium.policyId})`));
        continue;
      }
      const policy = policiesById.get(rawId);
      if (policy !== undefined) {
        refs.push(ref('policy', policy.id, `Policy ${policy.id} ${policy.policyNo} (${policy.line})`));
      }
    }
  }

  return { tool: 'getKpis', records, refs: uniqueRefs(refs) };
}

export type PolicyQuery = {
  line?: Line;
  country?: string;
  entityId?: string;
  expiringWithinDays?: number;
};

/** Policy rows. `expiringWithinDays` only includes active policies. */
export function findPolicies(query: PolicyQuery = {}): ToolResult {
  if (query.expiringWithinDays !== undefined) {
    if (
      !Number.isInteger(query.expiringWithinDays) ||
      query.expiringWithinDays < 0 ||
      query.expiringWithinDays > MAX_WINDOW_DAYS
    ) {
      throw new ToolError(
        `expiringWithinDays must be an integer between 0 and ${MAX_WINDOW_DAYS}, received ${String(query.expiringWithinDays)}`,
      );
    }
  }

  const asOf = portfolio.config.effectiveFrom;
  const entitiesById = new Map(portfolio.entities.map((entity) => [entity.id, entity]));
  const carriersById = new Map(portfolio.carriers.map((carrier) => [carrier.id, carrier]));
  const wantedCountry = query.country?.trim().toLowerCase();

  const records: ToolRecord[] = [];
  const refs: ToolRef[] = [];

  for (const policy of portfolio.policies) {
    if (query.line !== undefined && policy.line !== query.line) continue;
    if (query.entityId !== undefined && policy.entityId !== query.entityId) continue;

    const entity = entitiesById.get(policy.entityId);
    if (wantedCountry !== undefined) {
      if (wantedCountry === '') continue;
      if (entity === undefined || entity.country.toLowerCase() !== wantedCountry) continue;
    }

    let daysToExpiry: number | null = null;
    if (query.expiringWithinDays !== undefined) {
      if (policy.status !== 'Active') continue;
      if (policy.expiry <= asOf) continue;
      daysToExpiry = daysBetween(asOf, policy.expiry);
      if (daysToExpiry > query.expiringWithinDays) continue;
    } else if (policy.status === 'Active' && policy.expiry > asOf) {
      daysToExpiry = daysBetween(asOf, policy.expiry);
    }

    const carrier = carriersById.get(policy.carrierId);
    records.push({
      id: policy.id,
      kind: 'policy',
      policyNo: policy.policyNo,
      line: policy.line,
      entityId: policy.entityId,
      entityName: entity?.name ?? null,
      country: entity?.country ?? null,
      carrierId: policy.carrierId,
      carrier: carrier?.name ?? null,
      carrierRating: carrier?.rating ?? null,
      inception: policy.inception,
      expiry: policy.expiry,
      status: policy.status,
      daysToExpiry,
    });

    refs.push(ref('policy', policy.id, `Policy ${policy.id} ${policy.policyNo} (${policy.line})`));
    if (entity !== undefined) {
      refs.push(ref('entity', entity.id, `Entity ${entity.id} ${entity.name}`));
    }
    if (carrier !== undefined) {
      refs.push(
        ref('carrier', carrier.id, `Carrier ${carrier.id} ${carrier.name} (${carrier.rating})`),
      );
    }
  }

  records.sort((left, right) =>
    String(left.expiry) < String(right.expiry)
      ? -1
      : String(left.expiry) > String(right.expiry)
        ? 1
        : String(left.id) < String(right.id)
          ? -1
          : 1,
  );

  return { tool: 'findPolicies', records, refs: uniqueRefs(refs) };
}

export type RequirementQuery = {
  status?: RequirementStatus;
  counterpartyType?: CounterpartyType;
  line?: Line;
};

/** Contract requirements with their assessed status, placed limit and note. */
export function listRequirements(query: RequirementQuery = {}): ToolResult {
  const asOf = portfolio.config.effectiveFrom;
  const sitesById = new Map(portfolio.sites.map((site) => [site.id, site]));
  const records: ToolRecord[] = [];
  const refs: ToolRef[] = [];

  for (const requirement of portfolio.requirements) {
    if (query.line !== undefined && requirement.line !== query.line) continue;
    if (query.counterpartyType !== undefined && requirement.counterpartyType !== query.counterpartyType) {
      continue;
    }

    const assessment = requirementStatus(requirement, portfolio, asOf);
    if (query.status !== undefined && assessment.status !== query.status) continue;

    const site = sitesById.get(requirement.siteId);
    const ratio = assessment.requiredSgd > 0 ? assessment.placedSgd / assessment.requiredSgd : 1;
    const note =
      assessment.note ??
      (assessment.status === 'Met'
        ? `Placed limit ${formatSgd(assessment.placedSgd)} covers the required ${formatSgd(assessment.requiredSgd)}.`
        : assessment.status === 'At-risk'
          ? `Placed limit ${formatSgd(assessment.placedSgd)} is within the ${Math.round(assessment.tolerance * 100)}% tolerance of ${formatSgd(assessment.requiredSgd)}.`
          : `Placed limit ${formatSgd(assessment.placedSgd)} is below the required ${formatSgd(assessment.requiredSgd)}.`);

    records.push({
      id: requirement.id,
      kind: 'requirement',
      siteId: requirement.siteId,
      siteName: site?.name ?? null,
      counterpartyType: requirement.counterpartyType,
      counterparty: requirement.counterparty,
      agreementRef: requirement.agreementRef,
      clauseRef: requirement.clauseRef,
      line: requirement.line,
      peril: requirement.peril,
      requiredLimit: requirement.requiredLimit,
      currency: requirement.currency,
      requiredSgd: round2(assessment.requiredSgd),
      placedLimit: round2(assessment.placedSgd),
      ratio: Math.round(ratio * 10_000) / 10_000,
      status: assessment.status,
      tolerance: assessment.tolerance,
      note,
    });

    refs.push(
      ref(
        'requirement',
        requirement.id,
        `Requirement ${requirement.id} (${requirement.line}, ${site?.name ?? requirement.siteId})`,
      ),
    );
    refs.push(ref('site', requirement.siteId, siteLabel(requirement.siteId)));

    for (const coverage of activeCoveragesForSite(requirement.siteId, portfolio, asOf)) {
      if (coverage.line !== requirement.line) continue;
      refs.push(ref('coverage', coverage.id, `Coverage ${coverage.id} (${coverage.line})`));
    }
  }

  return { tool: 'listRequirements', records, refs: uniqueRefs(refs) };
}

export type ScoreQuery = {
  siteId: string;
};

/** Site score with the driver breakdown: weights and contributions. */
export function explainScore(query: ScoreQuery): ToolResult {
  const site = portfolio.sites.find((candidate) => candidate.id === query.siteId);
  if (site === undefined) {
    throw new ToolError(`unknown siteId ${JSON.stringify(query.siteId)}`);
  }

  const result = scoreSite(site, portfolio);
  const scoreId = `score-${site.id}`;
  const records: ToolRecord[] = [
    {
      id: scoreId,
      kind: 'score',
      siteId: site.id,
      siteName: site.name,
      score: result.score,
      band: result.band,
      thresholds: portfolio.config.thresholds,
      driverIds: result.drivers.map((driver) => `driver-${site.id}-${driver.driver}`),
    },
  ];
  const refs: ToolRef[] = [
    ref('site', site.id, `Site ${site.id} ${site.name}`),
    ref('score', scoreId, `Score for ${site.id} ${site.name} (${result.score}, ${result.band})`),
  ];

  for (const driver of result.drivers) {
    const driverId = `driver-${site.id}-${driver.driver}`;
    records.push({
      id: driverId,
      kind: 'driver',
      siteId: site.id,
      driver: driver.driver,
      subScore: driver.subScore,
      weight: Math.round(driver.weight * 10_000) / 10_000,
      contribution: driver.contribution,
    });
    refs.push(
      ref('driver', driverId, `${driver.driver} driver at ${site.id} (contribution ${driver.contribution})`),
    );
  }

  return { tool: 'explainScore', records, refs };
}

export type RenewalQuery = {
  withinDays: number;
};

/** Active policies expiring within `withinDays` of the effective date. */
export function listRenewals(query: RenewalQuery): ToolResult {
  const { withinDays } = query;
  if (!Number.isInteger(withinDays) || withinDays < 0 || withinDays > MAX_WINDOW_DAYS) {
    throw new ToolError(
      `withinDays must be an integer between 0 and ${MAX_WINDOW_DAYS}, received ${String(withinDays)}`,
    );
  }

  const asOf = portfolio.config.effectiveFrom;
  const entitiesById = new Map(portfolio.entities.map((entity) => [entity.id, entity]));
  const coveragesByPolicy = new Map<string, typeof portfolio.coverages>();
  for (const coverage of portfolio.coverages) {
    const list = coveragesByPolicy.get(coverage.policyId);
    if (list === undefined) coveragesByPolicy.set(coverage.policyId, [coverage]);
    else list.push(coverage);
  }

  const records: ToolRecord[] = [];
  const refs: ToolRef[] = [];

  for (const policy of portfolio.policies) {
    if (policy.status !== 'Active') continue;
    if (policy.expiry <= asOf) continue;
    const daysToExpiry = daysBetween(asOf, policy.expiry);
    if (daysToExpiry > withinDays) continue;

    let sumInsuredSgd = 0;
    for (const coverage of coveragesByPolicy.get(policy.id) ?? []) {
      if (coverage.validFrom > asOf) continue;
      if (coverage.validTo !== null && coverage.validTo < asOf) continue;
      sumInsuredSgd += toSgd(coverage.sumInsured, coverage.currency, portfolio.fxRates, asOf);
      refs.push(ref('coverage', coverage.id, `Coverage ${coverage.id} (${coverage.line})`));
    }

    const entity = entitiesById.get(policy.entityId);
    records.push({
      id: policy.id,
      kind: 'policy',
      policyNo: policy.policyNo,
      line: policy.line,
      entityId: policy.entityId,
      entityName: entity?.name ?? null,
      expiry: policy.expiry,
      daysToExpiry,
      sumInsuredSgd: round2(sumInsuredSgd),
    });
    refs.push(ref('policy', policy.id, `Policy ${policy.id} ${policy.policyNo} (${policy.line})`));
    if (entity !== undefined) {
      refs.push(ref('entity', entity.id, `Entity ${entity.id} ${entity.name}`));
    }
  }

  records.sort((left, right) =>
    String(left.expiry) < String(right.expiry)
      ? -1
      : String(left.expiry) > String(right.expiry)
        ? 1
        : String(left.id) < String(right.id)
          ? -1
          : 1,
  );

  return { tool: 'listRenewals', records, refs: uniqueRefs(refs) };
}

/** JSON-ish tool descriptions for the model. */
export function toolCatalog(): ToolSpec[] {
  return [
    {
      name: 'getKpis',
      description:
        'Group-level summary figures with their source record ids: TIV, insured value, adequacy %, active premium, requirement counts and renewal counts. Use for how much or how many questions about the whole group.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description:
              'ISO date (YYYY-MM-DD) that sets the renewal windows. Defaults to the portfolio effective date.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'findPolicies',
      description:
        'Policy rows with policy number, line, entity, carrier, rating, expiry and days to expiry. Optionally filter by line, country, entity or a renewal window.',
      parameters: {
        type: 'object',
        properties: {
          line: { type: 'string', enum: [...LINES], description: 'Insurance line, exact name.' },
          country: { type: 'string', description: 'Entity country, case-insensitive.' },
          entityId: { type: 'string', description: 'Entity id such as ent-02.' },
          expiringWithinDays: {
            type: 'integer',
            minimum: 0,
            maximum: MAX_WINDOW_DAYS,
            description: 'Only active policies expiring within this many days.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'listRequirements',
      description:
        'Contract requirements with required limit, placed limit (SGD), assessed status (Met, At-risk, Gap, Excluded), ratio and the exclusion note. Use for tenant, lender, JV and concession obligations.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: [...REQUIREMENT_STATUSES] },
          counterpartyType: { type: 'string', enum: [...COUNTERPARTY_TYPES] },
          line: { type: 'string', enum: [...LINES] },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'explainScore',
      description:
        'Risk score for one site: total score, band and every driver with its sub-score, normalised weight and contribution. Use to explain why a site is rated as it is.',
      parameters: {
        type: 'object',
        properties: {
          siteId: { type: 'string', description: 'Site id such as site-08.' },
        },
        required: ['siteId'],
        additionalProperties: false,
      },
    },
    {
      name: 'listRenewals',
      description:
        'Active policies expiring within a number of days of the effective date, with expiry, days to expiry and total sum insured in SGD. Use for renewal questions.',
      parameters: {
        type: 'object',
        properties: {
          withinDays: {
            type: 'integer',
            minimum: 0,
            maximum: MAX_WINDOW_DAYS,
            description: 'Look-ahead window in days.',
          },
        },
        required: ['withinDays'],
        additionalProperties: false,
      },
    },
  ];
}

type Args = Record<string, unknown>;

function argsOf(raw: unknown): Args {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ToolError('tool arguments must be a JSON object');
  }
  return raw as Args;
}

function readString(args: Args, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ToolError(`${key} must be a string`);
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readInteger(args: Args, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ToolError(`${key} must be an integer`);
  }
  return value;
}

function readCanonical<T extends string>(
  args: Args,
  key: string,
  allowed: readonly T[],
  label: string,
): T | undefined {
  const value = readString(args, key);
  if (value === undefined) return undefined;
  const match = allowed.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
  if (match === undefined) {
    throw new ToolError(`unknown ${label} ${JSON.stringify(value)}; expected one of: ${allowed.join(', ')}`);
  }
  return match;
}

/**
 * Dispatch a model tool call. Unknown tools, malformed arguments and unknown
 * record ids throw; the run loop turns that into a tool error the model can
 * correct on the next turn.
 */
export function runAssistantTool(name: string, rawArguments: unknown): ToolResult {
  const args = argsOf(rawArguments);

  switch (name) {
    case 'getKpis':
      return getKpis(readString(args, 'period'));

    case 'findPolicies': {
      const line = readCanonical(args, 'line', LINES, 'line');
      const country = readString(args, 'country');
      const entityId = readString(args, 'entityId');
      const expiringWithinDays = readInteger(args, 'expiringWithinDays');
      return findPolicies({
        ...(line === undefined ? {} : { line }),
        ...(country === undefined ? {} : { country }),
        ...(entityId === undefined ? {} : { entityId }),
        ...(expiringWithinDays === undefined ? {} : { expiringWithinDays }),
      });
    }

    case 'listRequirements': {
      const status = readCanonical(args, 'status', REQUIREMENT_STATUSES, 'status');
      const counterpartyType = readCanonical(
        args,
        'counterpartyType',
        COUNTERPARTY_TYPES,
        'counterpartyType',
      );
      const line = readCanonical(args, 'line', LINES, 'line');
      return listRequirements({
        ...(status === undefined ? {} : { status }),
        ...(counterpartyType === undefined ? {} : { counterpartyType }),
        ...(line === undefined ? {} : { line }),
      });
    }

    case 'explainScore': {
      const siteId = readString(args, 'siteId');
      if (siteId === undefined) throw new ToolError('siteId is required');
      return explainScore({ siteId });
    }

    case 'listRenewals': {
      const withinDays = readInteger(args, 'withinDays');
      if (withinDays === undefined) throw new ToolError('withinDays is required');
      return listRenewals({ withinDays });
    }

    default:
      throw new ToolError(
        `unknown tool ${JSON.stringify(name)}; available tools: ${TOOL_NAMES.join(', ')}`,
      );
  }
}
