// Data model per Credit_Assessment_PRD_v0.10.md §4.
// This is a frontend prototype: all "persistence" is an in-memory Zustand store.

export type Role = "Analyst" | "Approver" | "Auditor";

// FR7.1's "Returned for Revision" is a decision action, not a resting state:
// FR7.4 says a Return "re-enters Draft". A returned assessment is Draft with
// its most recent ApprovalDecision.action === "Return" (see selectors.ts).
export type AssessmentState = "Draft" | "Submitted" | "Approved" | "Rejected";

export type FieldStatus = "Unconfirmed" | "Confirmed" | "Amended" | "Not Present";

export type ConfidenceBand = "High" | "Medium" | "Low";

export type StatementSection = "Balance Sheet" | "Income Statement" | "Cash Flow";

export type DocumentType = "audited" | "unaudited" | "registration";

export interface Customer {
  id: string;
  name: string;
  industry: string;
  relationshipOwner: string; // analyst user id, drives FR8.10/NFR RBAC "own + team" scoping
}

export interface Assessment {
  id: string;
  customerId: string;
  version: number;
  state: AssessmentState;
  periods: string[]; // fiscal years/periods covered, e.g. ["FY2023","FY2024","FY2025"]
  createdBy: string;
  createdAt: string; // ISO date
  sourceAssessmentId: string | null; // FR8.3-8.4, self-reference, set only via Refresh Assessment
  screeningNote?: string; // not modeled — FR12 is V2, out of prototype scope
}

export interface AppDocument {
  id: string;
  customerId: string;
  type: DocumentType;
  period: string | null; // null for registration docs (FR1.8, not built — V2)
  currency: string | null;
  version: number;
  uploader: string;
  uploadDate: string;
  fileName: string;
  // many-to-many: which assessments currently reference this document (FR1.6)
  referencedByAssessmentIds: string[];
  supersedesDocumentId?: string; // FR1.5 version chain
}

export interface AmendmentHistoryEntry {
  previousValue: number | null;
  previousStatus: FieldStatus;
  newValue: number | null;
  newStatus: FieldStatus;
  reason?: string;
  actor: string;
  timestamp: string;
}

export interface ExtractedField {
  id: string;
  assessmentId: string; // owning scope (FR1.7) — never shared across assessments
  documentId: string; // provenance only
  fieldName: string; // standardized field name
  section: StatementSection;
  period: string;
  value: number | null; // null once status = "Not Present"
  originalExtractedValue: number | null; // retained for audit even after amend (FR3.6)
  unit: "currency" | "ratio-input";
  currency: string;
  confidenceScore: number | null; // 0-100, null if not applicable (e.g. copied field keeps original)
  sourcePointer: string; // e.g. "p.4, Balance Sheet, row 'Trade receivables'"
  extractionModelVersion: string;
  status: FieldStatus;
  amendmentHistory: AmendmentHistoryEntry[];
}

export type RatioCategory =
  | "Liquidity"
  | "Leverage"
  | "Profitability"
  | "Coverage"
  | "Efficiency";

export interface Ratio {
  id: string;
  assessmentId: string;
  ratioKey: string; // e.g. "current_ratio"
  label: string;
  category: RatioCategory;
  formulaDisplay: string;
  lineageFieldIds: string[]; // ExtractedField ids used
  value: number | null; // null when notCalculableFlag
  period: string;
  configVersionId: string;
  provisionalFlag: boolean;
  notCalculableFlag: boolean;
  computedAt: string;
}

export interface RatingDriver {
  ratioKey: string;
  label: string;
  points: number;
  weight: number;
  contribution: number; // points * weight, for the driver breakdown
}

export interface Rating {
  id: string;
  assessmentId: string;
  period: string; // most recent period scored
  compositeScore: number;
  grade: string; // e.g. "BB"
  band: string; // e.g. "Moderate risk"
  driverBreakdown: RatingDriver[];
  configVersionId: string;
  computedAt: string;
  hasProvisionalInput: boolean;
  hasNotCalculableInput: boolean;
}

export interface Recommendation {
  id: string;
  assessmentId: string;
  systemProposedLimit: number;
  systemProposedTermsDays: number;
  proposedLimit: number; // == systemProposedLimit unless overridden
  proposedTermsDays: number;
  overrideFlag: boolean;
  overrideJustification: string | null;
  configVersionId: string;
  effectiveDate: string | null; // set once Approved (FR8.7)
  currency: string;
}

export type ApprovalAction = "Approve" | "Reject" | "Return";

export interface ApprovalDecision {
  id: string;
  assessmentId: string;
  actor: string;
  action: ApprovalAction;
  comments: string;
  timestamp: string;
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

export interface ScorecardConfig {
  id: string;
  version: string;
  effectiveDate: string;
  createdBy: string;
  // PLACEHOLDER — illustrative only, pending client's baseline Excel template (PRD §5).
  confidenceThresholds: { high: number; medium: number };
  ratioBands: Record<string, { good: number; fair: number; direction: "higher-better" | "lower-better" }>;
  scorecardWeights: Record<string, number>;
  gradeBands: { minScore: number; grade: string; band: string }[];
  limitRules: { grade: string; limitMultiplierOfRevenue: number; termsDays: number }[];
}

export interface User {
  id: string;
  name: string;
  role: Role;
  team: string;
}
