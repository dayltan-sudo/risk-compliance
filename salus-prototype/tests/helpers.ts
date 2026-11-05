import type {
  Coverage,
  ContractRequirement,
  Policy,
  Portfolio,
  Site,
} from '../src/engine/types';
import { DEFAULT_THRESHOLDS } from '../src/engine/types';

export const m = (millions: number): number => millions * 1_000_000;

export const AS_OF = '2026-11-05';

export function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'site-test',
    entityId: 'ent-test',
    name: 'Test Site',
    country: 'Singapore',
    city: 'Singapore',
    lat: 1.35,
    lon: 103.74,
    // Deliberately absent from the asset-class exposure table: only property
    // is exposed, which keeps the mandatory driver at 0 in fixtures.
    assetClass: 'Test Asset',
    tivSgd: m(100),
    pmlSgd: m(40),
    natCatIndex: 0,
    countryRiskIndex: 0,
    claimsIndex: 0,
    ...overrides,
  };
}

export function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'pol-test',
    entityId: 'ent-test',
    policyNo: 'TEST-0001',
    line: 'Property & BI',
    carrierId: 'car-test',
    brokerId: 'brk-test',
    inception: '2026-01-01',
    expiry: '2027-12-31',
    currency: 'SGD',
    status: 'Active',
    ...overrides,
  };
}

export function makeCoverage(overrides: Partial<Coverage> = {}): Coverage {
  return {
    id: 'cov-test',
    policyId: 'pol-test',
    siteId: 'site-test',
    line: 'Property & BI',
    sumInsured: m(100),
    limitOcc: m(100),
    limitAgg: m(200),
    deductible: 0,
    basis: 'Replacement cost',
    currency: 'SGD',
    version: 1,
    validFrom: '2026-01-01',
    validTo: null,
    ...overrides,
  };
}

export function makeRequirement(overrides: Partial<ContractRequirement> = {}): ContractRequirement {
  return {
    id: 'req-test',
    assetId: 'ast-test',
    siteId: 'site-test',
    counterpartyType: 'Customer/Tenant',
    counterparty: 'Test Counterparty',
    agreementRef: 'AGREEMENT-1',
    clauseRef: 'Cl. 1.1',
    line: 'Property & BI',
    peril: 'Fire',
    requiredLimit: m(100),
    currency: 'SGD',
    ...overrides,
  };
}

export function makePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  const base: Portfolio = {
    entities: [{ id: 'ent-test', name: 'Test Entity', country: 'Singapore', businessUnit: 'Test' }],
    sites: [makeSite()],
    assets: [
      {
        id: 'ast-test',
        siteId: 'site-test',
        label: 'Test Asset',
        declaredValueSgd: m(100),
        pmlSgd: m(40),
        valuationDate: '2026-06-30',
      },
    ],
    carriers: [{ id: 'car-test', name: 'Test Carrier', rating: 'AA-', ratingDate: '2026-01-01' }],
    brokers: [{ id: 'brk-test', name: 'Test Broker' }],
    policies: [makePolicy()],
    coverages: [makeCoverage()],
    premiums: [],
    requirements: [],
    exclusions: [],
    fxRates: [{ date: '2026-06-30', currency: 'USD', sgdPerUnit: 1.35 }],
    config: {
      effectiveFrom: AS_OF,
      weights: {
        coverageGap: 0.28,
        underinsuredTiv: 0.18,
        natCat: 0.14,
        countryRisk: 0.1,
        claims: 0.08,
        carrier: 0.1,
        emerging: 0,
        mandatory: 0.12,
      },
      thresholds: { ...DEFAULT_THRESHOLDS },
    },
  };
  return { ...base, ...overrides };
}
