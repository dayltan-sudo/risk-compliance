// Data model per Credit_Assessment_PRD_MVP.md (v1.2-MVP) §4.
// This is a frontend prototype: all "persistence" is an in-memory Zustand store.

// FR7.1's "Returned for Revision" is a decision action, not a resting state:
// FR7.4 says a Return "re-enters Draft". A returned assessment is Draft with
// its most recent ApprovalDecision.action === "Return" (see selectors.ts).
export type AssessmentState = "Draft" | "Submitted" | "Approved" | "Rejected";

export type RelationshipType = "New" | "Renewal";
export type RecencyFlag = "Recent" | "Non-Recent";

export type FieldStatus = "Unconfirmed" | "Confirmed" | "Amended";

export type ConfidenceBand = "High" | "Medium" | "Low";

export type StatementSection = "Balance Sheet" | "Income Statement" | "Cash Flow";

export type DocumentType = "audited" | "unaudited" | "registry";
export type StatementBasis = "standalone" | "consolidated";
export type PresentationScale = "units" | "thousands" | "millions";

export interface Customer {
  id: string;
  name: string;
  industry: string;
  relationshipOwner: string;
}

export interface Assessment {
  id: string;
  customerId: string;
  division: string; // FR8.1 — the unit of continuity is (customerId, division), not customerId alone
  version: number;
  state: AssessmentState;
  relationshipType: RelationshipType; // FR5.13, derived at creation, scoped to (customerId, division)
  relationshipTypeOverridden: boolean;
  relationshipTypeOverrideReason: string | null;
  assessmentYear: number; // FR4.4 — set once at creation, never re-derived
  recencyFlag: RecencyFlag | null; // FR3.12 — null until a financials_date exists to compare
  periods: string[]; // exactly two once both uploaded (FR1.3): [prior, current]
  // FR5.7 — contract metadata, no score impact
  productType: string | null;
  contractStartDate: string | null;
  contractPeriodMonths: number | null;
  contractValueOrAverageDemand: number | null;
  principalActivities: string | null;
  parentageShareholding: string | null;
  auditedFinancialsFlag: boolean | null;
  createdBy: string;
  createdAt: string; // ISO date
  submittedBy: string | null; // FR7.2 — recorded from day one, unread by any guard at MVP
  submittedAt: string | null;
}

export interface AppDocument {
  id: string;
  assessmentId: string; // FR1.1 — documents belong to a single assessment, not customer-scoped (FR1.6/1.7 deferred)
  type: DocumentType;
  period: string | null; // null for registry docs (FR1.6)
  financialsDate: string | null; // null for registry docs — drives FR3.12 recency
  presentationCurrency: string | null; // provenance only, FR1.4/FR2.4
  presentationScale: PresentationScale | null; // provenance only
  statementBasis: StatementBasis | null; // provenance only, null for registry docs
  version: number;
  uploader: string;
  uploadDate: string;
  fileName: string;
  supersedesDocumentId: string | null; // FR1.5 version chain
}

export interface AmendmentHistoryEntry {
  previousValue: number | boolean | string | null;
  previousStatus: FieldStatus | CriterionInputStatus;
  newValue: number | boolean | string | null;
  newStatus: FieldStatus | CriterionInputStatus;
  reason?: string;
  actor: string;
  timestamp: string;
}

// FR2.2's closed 11-field set. "Net Operating Cash Flow Positive" is a sign
// test (baseline cell C33, Yes/No), not an amount — see FIELD_DEFS/valueType
// in data/config.ts.
export type StandardFieldName =
  | "Sales"
  | "NPAT"
  | "Current Assets"
  | "Cash and Bank Balances"
  | "Non-Current Assets"
  | "Total Assets"
  | "Current Liabilities"
  | "Non-Current Liabilities"
  | "Total Liabilities"
  | "Total Equity"
  | "Net Operating Cash Flow Positive";

export interface ExtractedField {
  id: string;
  assessmentId: string;
  documentId: string;
  fieldName: StandardFieldName;
  section: StatementSection;
  period: string;
  value: number | boolean | null; // null once confirmed absent (FR3.5); boolean for the one sign-test field
  originalExtractedValue: number | boolean | null;
  scaleApplied: PresentationScale | null; // FR2.4 provenance — no computation reads this
  currency: string | null; // FR2.4 provenance
  confidenceScore: number | null; // 0-100, null once confirmed absent
  sourcePointer: string | null;
  extractionModelVersion: string | null;
  status: FieldStatus;
  amendmentHistory: AmendmentHistoryEntry[];
}

// --- FR5 non-financial criterion inputs ------------------------------------

export type CriterionNumber = 5 | 7 | 8 | 9 | 11;
export type CriterionInputStatus = "Unconfirmed" | "Confirmed" | "Amended";
export type PaidUpCapitalSource = "registry" | "statement-note" | "manual";
export type LitigationRecord = "Clean" | "Motor suits only" | "Other record";
export type PromptPaymentRecord = "Good" | "Late" | "None held";

export interface CriterionInput {
  id: string;
  assessmentId: string;
  criterionNumber: CriterionNumber;
  // Criterion 5 only — two independent numbers (FR5.2), not a single value:
  // their quotient is criterion 5's derived scorecard input (FR4.3).
  paidUpCapital: number | null;
  totalExposure: number | null;
  currency: string | null; // FR5.6 — must match between the two above
  source: PaidUpCapitalSource | null; // FR5.8
  sourceDocumentId: string | null; // set for registry/statement-note, null for manual
  // Criterion 7 only
  yearRegisteredSg: number | null;
  // Criterion 8 only
  litigationRecord: LitigationRecord | null;
  // Criterion 9 only
  changeInDirectors: boolean | null;
  // Criterion 11 only
  promptPaymentRecord: PromptPaymentRecord | null;
  // Criteria 8 and 11 only (FR5.10/FR5.12) — required to confirm, no score effect
  evidenceSource: string | null;
  evidencePeriodOrDate: string | null;
  status: CriterionInputStatus;
  amendmentHistory: AmendmentHistoryEntry[];
  enteredBy: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

// --- FR3.6/3.7 integrity checks + FR3.13 discrepancy attribution -----------

export type IntegrityCheckName =
  | "npat_le_sales"
  | "cash_le_current_assets"
  | "current_assets_le_total_assets"
  | "non_current_assets_le_total_assets"
  | "current_liabilities_le_total_liabilities"
  | "non_current_liabilities_le_total_liabilities"
  | "total_assets_eq_ca_plus_nca"
  | "total_liabilities_eq_cl_plus_ncl"
  | "equity_plus_liabilities_eq_assets";

export interface OperandMovement {
  fieldName: StandardFieldName;
  changePct: number | null; // (current-prior)/prior, same rule as FR4.6 — null when not calculable
}

export interface IntegrityCheckResult {
  id: string;
  assessmentId: string;
  checkName: IntegrityCheckName;
  period: string;
  operandFieldIds: string[];
  expected: number | null;
  actual: number | null;
  passed: boolean;
  toleranceApplied: number | null; // 0.1% of Total Assets for the 3 equality checks, null for the 6 inequalities
  difference: number | null; // signed expected-actual, failure-only (FR3.13)
  operandMovementRanking: OperandMovement[] | null; // failure-only; [] is valid, not an error
  evaluatedAt: string;
}

// --- FR4 ratios + FR4.3 derived scorecard inputs ----------------------------

export type RatioKey =
  | "working_capital"
  | "current_ratio"
  | "net_profit_margin"
  | "debt_to_equity"
  | "wc_over_revenue"
  | "paid_up_capital_cover"
  | "profitability_history"
  | "years_established";

export type ZeroDivisorField = "Current Liabilities" | "Total Equity" | "Sales";

export interface Ratio {
  id: string;
  assessmentId: string;
  ratioKey: RatioKey;
  label: string;
  formulaDisplay: string;
  lineageFieldIds: string[]; // ExtractedField and/or CriterionInput ids
  period: string | null; // null for profitability_history (spans both) and years_established (spans neither)
  valueNumeric: number | null;
  signPair: { currentPositive: boolean | null; priorPositive: boolean | null } | null; // profitability_history only
  notCalculableReason: string | null; // FR4.7 — names the missing input
  zeroDivisorField: ZeroDivisorField | null; // FR4.11/4.12
  zeroDivisorTierApplied: 1 | 2 | 3 | null; // the tier FR4.12's rule assigned — rating.ts reads this, never re-derives
  scorecardVersion: string;
  computedAt: string;
}

// --- FR6 scorecard & rating --------------------------------------------------

export type RatingClass = "A" | "B" | "C";
export type WeightSet = "new" | "renewal";
export type CriterionNumberAll = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type CriterionFourCondition = "high_leverage" | "negative_equity" | "zero_equity";

export interface CriterionDriver {
  criterionNumber: CriterionNumberAll;
  label: string;
  tier: 1 | 2 | 3;
  weight: number;
  contribution: number; // tier * weight
  sourceInput: string; // human-readable, e.g. "Current Ratio = 1.8x (FY2025)"
  tierOneCondition: CriterionFourCondition | null; // criterion 4 only (FR6.10)
}

export interface Rating {
  id: string;
  assessmentId: string;
  compositeScore: number; // 100-300
  ratingClass: RatingClass;
  handlingRoute: string;
  weightSet: WeightSet;
  driverBreakdown: CriterionDriver[]; // exactly 11 entries, ordered 1-11
  scorecardVersion: string;
  computedAt: string;
}

// --- FR11 Risk Commentary ----------------------------------------------------

export type ObservationCategory =
  | "Earnings quality"
  | "Capital erosion"
  | "Liquidity composition"
  | "Concentration"
  | "Trajectory"
  | "Boundary proximity";

export interface CitedFigure {
  entity: string;
  field: string;
  value: string;
}

export interface RiskObservation {
  category: ObservationCategory;
  statement: string;
  citedFigures: CitedFigure[];
}

export interface RiskCommentary {
  id: string;
  assessmentId: string;
  ratingId: string;
  observations: RiskObservation[];
  noObservations: boolean;
  modelVersion: string;
  promptVersion: string;
  generatedAt: string;
  supersededAt: string | null;
}

// --- FR7 approval -------------------------------------------------------------

export type ApprovalAction = "Approve" | "Reject" | "Return";

export interface ApprovalDecision {
  id: string;
  assessmentId: string;
  actor: string;
  action: ApprovalAction;
  comments: string;
  timestamp: string;
  policyVersion: string; // FR7.5
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  actor: string;
  action: string;
  beforeValue: string | null;
  afterValue: string | null;
  timestamp: string;
}

// User is a "who am I" convenience for this no-auth prototype — MVP has one
// authenticated user type, no roles, no team scoping (PRD §1).
export interface User {
  id: string;
  name: string;
}
