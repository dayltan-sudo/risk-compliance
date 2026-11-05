/**
 * Domain types for the Salus prototype.
 *
 * Conventions:
 * - Money is a plain `number` in the record's own `currency`. No floats-as-strings.
 * - Dates are ISO `YYYY-MM-DD` strings, never Date objects.
 * - Base currency is SGD.
 * - The engine is pure: time and configuration are always passed in.
 */

export type Currency = 'SGD' | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CNY' | 'JPY' | 'VND';

export const CURRENCIES: readonly Currency[] = [
  'SGD',
  'USD',
  'EUR',
  'GBP',
  'AUD',
  'CNY',
  'JPY',
  'VND',
];

export type Line =
  | 'Property & BI'
  | 'Construction'
  | 'Marine Cargo'
  | 'Marine Hull'
  | 'General Liability'
  | 'Products Liability'
  | 'Professional Indemnity'
  | 'Directors & Officers'
  | 'Cyber'
  | "Workmen's Compensation"
  | 'Motor Fleet'
  | 'Political Violence'
  | 'Political Risk';

export const LINES: readonly Line[] = [
  'Property & BI',
  'Construction',
  'Marine Cargo',
  'Marine Hull',
  'General Liability',
  'Products Liability',
  'Professional Indemnity',
  'Directors & Officers',
  'Cyber',
  "Workmen's Compensation",
  'Motor Fleet',
  'Political Violence',
  'Political Risk',
];

/** Lines whose limits are treated as covering TIV (property exposure). */
export const TIV_COVER_LINES: readonly Line[] = ['Property & BI', 'Construction'];

export type Band = 'Low' | 'Medium' | 'High' | 'Critical';

export type RequirementStatus = 'Met' | 'At-risk' | 'Gap' | 'Excluded';

export type CounterpartyType = 'Customer/Tenant' | 'Lender' | 'JV Partner' | 'Government/Concession';

export type Driver =
  | 'coverageGap'
  | 'underinsuredTiv'
  | 'natCat'
  | 'countryRisk'
  | 'claims'
  | 'carrier'
  | 'emerging'
  | 'mandatory';

export const DRIVERS: readonly Driver[] = [
  'coverageGap',
  'underinsuredTiv',
  'natCat',
  'countryRisk',
  'claims',
  'carrier',
  'emerging',
  'mandatory',
];

/** A ratio always carries its inputs so the UI can show lineage. */
export type Ratio = {
  value: number;
  numerator: number;
  denominator: number;
  formula: string;
};

export type DriverScore = {
  driver: Driver;
  subScore: number;
  /** Weight actually used, after normalising over the non-zero drivers. */
  weight: number;
  contribution: number;
};

export type Thresholds = {
  itvUnder: number;
  itvOver: number;
  atRiskTolerance: number;
  bandMedium: number;
  bandHigh: number;
  bandCritical: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  itvUnder: 0.9,
  itvOver: 1.1,
  atRiskTolerance: 0.1,
  bandMedium: 40,
  bandHigh: 70,
  bandCritical: 85,
};

export type Entity = {
  id: string;
  name: string;
  country: string;
  businessUnit: string;
};

export type Site = {
  id: string;
  entityId: string;
  name: string;
  country: string;
  city: string;
  lat: number;
  lon: number;
  assetClass: string;
  tivSgd: number;
  pmlSgd: number;
  /** 0-100, as stored. */
  natCatIndex: number;
  countryRiskIndex: number;
  claimsIndex: number;
};

export type Asset = {
  id: string;
  siteId: string;
  label: string;
  declaredValueSgd: number;
  pmlSgd: number;
  valuationDate: string;
};

export type Carrier = {
  id: string;
  name: string;
  /** e.g. 'AA-', 'BBB+', 'BB'. */
  rating: string;
  ratingDate: string;
};

export type Broker = {
  id: string;
  name: string;
};

export type PolicyStatus = 'Active' | 'Expired';

export type Policy = {
  id: string;
  entityId: string;
  policyNo: string;
  line: Line;
  carrierId: string;
  brokerId: string;
  inception: string;
  expiry: string;
  currency: Currency;
  status: PolicyStatus;
};

export type Coverage = {
  id: string;
  policyId: string;
  siteId: string;
  line: Line;
  sumInsured: number;
  limitOcc: number;
  limitAgg: number;
  deductible: number;
  basis: string;
  currency: Currency;
  version: number;
  validFrom: string;
  /** null means open-ended (current version). */
  validTo: string | null;
  biSumInsured?: number;
  annualGrossProfit?: number;
};

export type Premium = {
  id: string;
  policyId: string;
  gross: number;
  currency: Currency;
  period: string;
};

export type ContractRequirement = {
  id: string;
  assetId: string;
  siteId: string;
  counterpartyType: CounterpartyType;
  counterparty: string;
  agreementRef: string;
  clauseRef: string;
  line: Line;
  peril: string;
  requiredLimit: number;
  currency: Currency;
  /** Defaults to 0.10 when omitted. */
  tolerance?: number;
};

export type ExclusionScope = 'full' | 'sublimit';

export type Exclusion = {
  id: string;
  coverageId: string;
  siteId: string;
  line: Line;
  scope: ExclusionScope;
  /** A peril name, or 'all' for a full exclusion of every peril on the line. */
  peril: string;
  /** In the referenced coverage's currency. Only meaningful for scope 'sublimit'. */
  sublimit?: number;
  clauseRef: string;
  wordingExcerpt: string;
};

export type FxRate = {
  date: string;
  currency: Currency;
  sgdPerUnit: number;
};

export type ConfigVersion = {
  effectiveFrom: string;
  weights: Record<Driver, number>;
  thresholds: Thresholds;
};

export type AuditEvent = {
  actor: string;
  action: string;
  objectType: string;
  objectId: string;
  before: unknown;
  after: unknown;
  at: string;
};

export type Portfolio = {
  entities: Entity[];
  sites: Site[];
  assets: Asset[];
  carriers: Carrier[];
  brokers: Broker[];
  policies: Policy[];
  coverages: Coverage[];
  premiums: Premium[];
  requirements: ContractRequirement[];
  exclusions: Exclusion[];
  fxRates: FxRate[];
  config: ConfigVersion;
};

export type ItvFlag = 'under' | 'ok' | 'over';

export type ItvRatio = Ratio & { flag: ItvFlag };

export type PmlFlag = 'below' | 'ok';

export type PmlRatio = Ratio & { flag: PmlFlag };

export type RequirementAssessment = {
  status: RequirementStatus;
  ratio: number;
  note?: string;
  placedSgd: number;
  requiredSgd: number;
  /** Tolerance applied, as a fraction. */
  tolerance: number;
};

export type SiteScore = {
  score: number;
  band: Band;
  drivers: DriverScore[];
};

export type RequirementCounts = Record<RequirementStatus, number> & { total: number };

export type RenewalBuckets = {
  d30: number;
  d60: number;
  d90: number;
};

export type Hotspot = {
  siteId: string;
  siteName: string;
  entityId: string;
  score: number;
  band: Band;
};

export type GroupSummary = {
  tivSgd: number;
  insuredSgd: number;
  adequacyPct: number;
  openGaps: number;
  atRisk: number;
  excluded: number;
  renewals: RenewalBuckets;
  hotspots: Hotspot[];
  premiumSgd: number;
  requirementCounts: RequirementCounts;
};
