/**
 * Drizzle schema mirroring `src/engine/types.ts`.
 *
 * Money is `double precision` here because this is a prototype and every
 * figure is synthetic. A production system would use `numeric(18,2)` and a
 * decimal type in the engine; that change is deliberately out of scope.
 *
 * Dates are `date` columns which drizzle returns as ISO `YYYY-MM-DD` strings,
 * matching the domain model.
 */

import {
  bigserial,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';
import type {
  CounterpartyType,
  Currency,
  Driver,
  ExclusionScope,
  Line,
  PolicyStatus,
} from '../engine/types';

export const entities = pgTable('entities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  businessUnit: text('business_unit').notNull(),
});

export const sites = pgTable('sites', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  name: text('name').notNull(),
  country: text('country').notNull(),
  city: text('city').notNull(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  assetClass: text('asset_class').notNull(),
  tivSgd: doublePrecision('tiv_sgd').notNull(),
  pmlSgd: doublePrecision('pml_sgd').notNull(),
  natCatIndex: integer('nat_cat_index').notNull(),
  countryRiskIndex: integer('country_risk_index').notNull(),
  claimsIndex: integer('claims_index').notNull(),
});

export const assets = pgTable('assets', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id),
  label: text('label').notNull(),
  declaredValueSgd: doublePrecision('declared_value_sgd').notNull(),
  pmlSgd: doublePrecision('pml_sgd').notNull(),
  valuationDate: date('valuation_date').notNull(),
});

export const carriers = pgTable('carriers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rating: text('rating').notNull(),
  ratingDate: date('rating_date').notNull(),
});

export const brokers = pgTable('brokers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const policies = pgTable('policies', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  policyNo: text('policy_no').notNull(),
  line: text('line').notNull().$type<Line>(),
  carrierId: text('carrier_id')
    .notNull()
    .references(() => carriers.id),
  brokerId: text('broker_id')
    .notNull()
    .references(() => brokers.id),
  inception: date('inception').notNull(),
  expiry: date('expiry').notNull(),
  currency: text('currency').notNull().$type<Currency>(),
  status: text('status').notNull().$type<PolicyStatus>(),
});

export const coverages = pgTable('coverages', {
  id: text('id').primaryKey(),
  policyId: text('policy_id')
    .notNull()
    .references(() => policies.id),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id),
  line: text('line').notNull().$type<Line>(),
  sumInsured: doublePrecision('sum_insured').notNull(),
  limitOcc: doublePrecision('limit_occ').notNull(),
  limitAgg: doublePrecision('limit_agg').notNull(),
  deductible: doublePrecision('deductible').notNull(),
  basis: text('basis').notNull(),
  currency: text('currency').notNull().$type<Currency>(),
  version: integer('version').notNull().default(1),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'),
  biSumInsured: doublePrecision('bi_sum_insured'),
  annualGrossProfit: doublePrecision('annual_gross_profit'),
});

export const premiums = pgTable('premiums', {
  id: text('id').primaryKey(),
  policyId: text('policy_id')
    .notNull()
    .references(() => policies.id),
  gross: doublePrecision('gross').notNull(),
  currency: text('currency').notNull().$type<Currency>(),
  period: text('period').notNull(),
});

export const contractRequirements = pgTable('contract_requirements', {
  id: text('id').primaryKey(),
  assetId: text('asset_id')
    .notNull()
    .references(() => assets.id),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id),
  counterpartyType: text('counterparty_type').notNull().$type<CounterpartyType>(),
  counterparty: text('counterparty').notNull(),
  agreementRef: text('agreement_ref').notNull(),
  clauseRef: text('clause_ref').notNull(),
  line: text('line').notNull().$type<Line>(),
  peril: text('peril').notNull(),
  requiredLimit: doublePrecision('required_limit').notNull(),
  currency: text('currency').notNull().$type<Currency>(),
  tolerance: doublePrecision('tolerance').notNull().default(0.1),
});

export const exclusions = pgTable('exclusions', {
  id: text('id').primaryKey(),
  coverageId: text('coverage_id')
    .notNull()
    .references(() => coverages.id),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id),
  line: text('line').notNull().$type<Line>(),
  scope: text('scope').notNull().$type<ExclusionScope>(),
  peril: text('peril').notNull(),
  sublimit: doublePrecision('sublimit'),
  clauseRef: text('clause_ref').notNull(),
  wordingExcerpt: text('wording_excerpt').notNull(),
});

export const fxRates = pgTable(
  'fx_rates',
  {
    date: date('date').notNull(),
    currency: text('currency').notNull().$type<Currency>(),
    sgdPerUnit: doublePrecision('sgd_per_unit').notNull(),
  },
  (table) => [primaryKey({ columns: [table.date, table.currency] })],
);

export const configVersions = pgTable('config_versions', {
  effectiveFrom: date('effective_from').primaryKey(),
  weights: jsonb('weights').notNull().$type<Record<Driver, number>>(),
  thresholds: jsonb('thresholds')
    .notNull()
    .$type<{
      itvUnder: number;
      itvOver: number;
      atRiskTolerance: number;
      bandMedium: number;
      bandHigh: number;
      bandCritical: number;
    }>(),
});

export const auditEvents = pgTable('audit_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  objectType: text('object_type').notNull(),
  objectId: text('object_id').notNull(),
  before: jsonb('before').$type<unknown>(),
  after: jsonb('after').$type<unknown>(),
  at: text('at').notNull(),
});
