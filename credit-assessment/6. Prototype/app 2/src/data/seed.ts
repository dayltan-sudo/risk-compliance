import type {
  AmendmentHistoryEntry,
  ApprovalDecision,
  AppDocument,
  AuditLogEntry,
  Assessment,
  Customer,
  ExtractedField,
  FieldStatus,
  Rating,
  Ratio,
  Recommendation,
  StatementSection,
  User,
} from "../types";
import { PLACEHOLDER_CONFIG, STANDARD_FIELDS } from "./config";
import { synthesizeFinancials, synthesizeConfidence } from "./synthesize";
import { computeAllRatios } from "../engine/ratios";
import { computeRating } from "../engine/rating";
import { computeRecommendation } from "../engine/recommendation";

const CONFIG = PLACEHOLDER_CONFIG;
const EXTRACTION_MODEL_VERSION = "extract-v1.4.2";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const sectionOf = (name: string): StatementSection => STANDARD_FIELDS.find((f) => f.name === name)!.section;

export const USERS: User[] = [
  { id: "u-alice", name: "Alice Chen", role: "Analyst", team: "Team Alpha" },
  { id: "u-ben", name: "Ben Osei", role: "Analyst", team: "Team Beta" },
  { id: "u-priya", name: "Priya Nair", role: "Approver", team: "Credit Committee" },
  { id: "u-morgan", name: "Morgan Reyes", role: "Auditor", team: "Internal Audit" },
];
export const DEFAULT_USER_ID = "u-alice";

export const customers: Customer[] = [
  { id: "c-meridian", name: "Meridian Steel Pty Ltd", industry: "Manufacturing", relationshipOwner: "u-alice" },
  { id: "c-harborvine", name: "Harbor & Vine Wholesale", industry: "Distribution", relationshipOwner: "u-alice" },
  { id: "c-solstice", name: "Solstice Retail Group", industry: "Retail", relationshipOwner: "u-alice" },
  { id: "c-ferro", name: "Ferro Dynamics Ltd", industry: "Industrial Equipment", relationshipOwner: "u-ben" },
  { id: "c-palisade", name: "Palisade Foods Co", industry: "Food & Beverage", relationshipOwner: "u-alice" },
];

export const documents: AppDocument[] = [];
export const assessments: Assessment[] = [];
export const extractedFields: ExtractedField[] = [];
export const ratios: Ratio[] = [];
export const ratings: Rating[] = [];
export const recommendations: Recommendation[] = [];
export const approvalDecisions: ApprovalDecision[] = [];
export const auditLog: AuditLogEntry[] = [];

let auditCounter = 0;
function logAudit(entry: Omit<AuditLogEntry, "id">) {
  auditCounter += 1;
  auditLog.push({ id: `audit-${auditCounter}`, ...entry });
}

interface PeriodFinancials {
  [period: string]: Record<string, number>;
}

/** Builds a full ExtractedField set for one assessment across the given periods. */
function buildFields(
  assessmentId: string,
  periods: string[],
  financials: PeriodFinancials,
  documentIdByPeriod: Record<string, string>,
  opts: {
    defaultStatus?: FieldStatus;
    confidenceSeedPrefix: string;
    overrides?: Record<string, { status: FieldStatus; confidenceScore?: number | null }>; // key `${period}|${fieldName}`
    amendments?: Record<string, AmendmentHistoryEntry[]>;
  },
): ExtractedField[] {
  const defaultStatus = opts.defaultStatus ?? "Confirmed";
  const out: ExtractedField[] = [];
  periods.forEach((period) => {
    STANDARD_FIELDS.forEach((fdef, fIdx) => {
      const key = `${period}|${fdef.name}`;
      const override = opts.overrides?.[key];
      const status = override?.status ?? defaultStatus;
      const rawValue = financials[period][fdef.name];
      const value = status === "Not Present" ? null : rawValue;
      const confidenceScore =
        override && "confidenceScore" in override
          ? override.confidenceScore ?? null
          : synthesizeConfidence(`${opts.confidenceSeedPrefix}-${period}-${fdef.name}`);
      out.push({
        id: `f-${assessmentId}-${slug(period)}-${slug(fdef.name)}`,
        assessmentId,
        documentId: documentIdByPeriod[period],
        fieldName: fdef.name,
        section: fdef.section,
        period,
        value,
        originalExtractedValue: rawValue,
        unit: "currency",
        currency: "USD",
        confidenceScore: status === "Not Present" ? null : confidenceScore,
        sourcePointer: `p.${2 + (fIdx % 6)}, ${sectionOf(fdef.name)}, row '${fdef.name}' (${period})`,
        extractionModelVersion: EXTRACTION_MODEL_VERSION,
        status,
        amendmentHistory: opts.amendments?.[key] ?? [],
      });
    });
  });
  return out;
}

function finalizeAssessment(assessment: Assessment, periods: string[]) {
  const fields = extractedFields.filter((f) => f.assessmentId === assessment.id);
  const now = assessment.createdAt;
  const rs = computeAllRatios(assessment.id, periods, fields, CONFIG, now);
  ratios.push(...rs);
  const mostRecentPeriod = periods[periods.length - 1];
  const ratiosForMostRecent = rs.filter((r) => r.period === mostRecentPeriod);
  const rating = computeRating(assessment.id, ratiosForMostRecent, mostRecentPeriod, CONFIG, now);
  ratings.push(rating);
  const revenueField = fields.find((f) => f.fieldName === "Revenue" && f.period === mostRecentPeriod);
  const rec = computeRecommendation(assessment.id, rating, revenueField?.value ?? 0, "USD", CONFIG);
  if (rec) recommendations.push(rec);
  return { rating, rec };
}

// ---------------------------------------------------------------------------
// c-meridian: two Approved assessments (v1, then a refresh v2) — demonstrates
// FR1.6/FR1.7 document reuse + copy-on-reuse, and gives a real refresh-source
// for the user's own live Refresh Assessment demo to compare against (FR8.8-9).
// ---------------------------------------------------------------------------
{
  const custId = "c-meridian";
  const finFY23: Record<string, number> = {
    "Cash & Equivalents": 150000, "Accounts Receivable": 280000, Inventory: 320000,
    "Total Current Assets": 750000, "Total Assets": 1900000, "Accounts Payable": 210000,
    "Total Current Liabilities": 430000, "Total Debt": 480000, "Total Liabilities": 900000,
    "Total Equity": 1000000, Revenue: 2400000, "Cost of Goods Sold": 1680000, "Gross Profit": 720000,
    EBITDA: 360000, EBIT: 300000, "Interest Expense": 60000, "Net Income": 180000,
    "Operating Cash Flow": 260000, "Capital Expenditure": 90000,
  };
  const finFY24: Record<string, number> = {
    "Cash & Equivalents": 190000, "Accounts Receivable": 300000, Inventory: 340000,
    "Total Current Assets": 830000, "Total Assets": 2050000, "Accounts Payable": 220000,
    "Total Current Liabilities": 450000, "Total Debt": 470000, "Total Liabilities": 930000,
    "Total Equity": 1120000, Revenue: 2700000, "Cost of Goods Sold": 1850000, "Gross Profit": 850000,
    EBITDA: 430000, EBIT: 360000, "Interest Expense": 62000, "Net Income": 225000,
    "Operating Cash Flow": 310000, "Capital Expenditure": 100000,
  };
  const finFY25: Record<string, number> = {
    "Cash & Equivalents": 230000, "Accounts Receivable": 330000, Inventory: 360000,
    "Total Current Assets": 920000, "Total Assets": 2220000, "Accounts Payable": 235000,
    "Total Current Liabilities": 470000, "Total Debt": 440000, "Total Liabilities": 950000,
    "Total Equity": 1270000, Revenue: 3050000, "Cost of Goods Sold": 2050000, "Gross Profit": 1000000,
    EBITDA: 500000, EBIT: 420000, "Interest Expense": 58000, "Net Income": 270000,
    "Operating Cash Flow": 360000, "Capital Expenditure": 110000,
  };

  const docFY23: AppDocument = {
    id: "doc-meridian-fy23", customerId: custId, type: "audited", period: "FY2023", currency: "USD",
    version: 1, uploader: "u-alice", uploadDate: "2025-02-10", fileName: "Meridian_Steel_FY2023_Audited.pdf",
    referencedByAssessmentIds: [],
  };
  const docFY24: AppDocument = {
    id: "doc-meridian-fy24", customerId: custId, type: "audited", period: "FY2024", currency: "USD",
    version: 1, uploader: "u-alice", uploadDate: "2025-02-10", fileName: "Meridian_Steel_FY2024_Audited.pdf",
    referencedByAssessmentIds: [],
  };
  const docFY25: AppDocument = {
    id: "doc-meridian-fy25", customerId: custId, type: "audited", period: "FY2025", currency: "USD",
    version: 1, uploader: "u-alice", uploadDate: "2026-02-14", fileName: "Meridian_Steel_FY2025_Audited.pdf",
    referencedByAssessmentIds: [],
  };
  documents.push(docFY23, docFY24, docFY25);

  const v1: Assessment = {
    id: "a-meridian-v1", customerId: custId, version: 1, state: "Approved", periods: ["FY2023", "FY2024"],
    createdBy: "u-alice", createdAt: "2025-02-12", sourceAssessmentId: null,
  };
  assessments.push(v1);
  docFY23.referencedByAssessmentIds.push(v1.id);
  docFY24.referencedByAssessmentIds.push(v1.id);
  extractedFields.push(
    ...buildFields(v1.id, v1.periods, { FY2023: finFY23, FY2024: finFY24 },
      { FY2023: docFY23.id, FY2024: docFY24.id }, { confidenceSeedPrefix: "meridian-v1" }),
  );
  const v1res = finalizeAssessment(v1, v1.periods);
  approvalDecisions.push({ id: "dec-meridian-v1", assessmentId: v1.id, actor: "u-priya", action: "Approve", comments: "Solid liquidity and coverage; approved as proposed.", timestamp: "2025-02-20" });
  recommendations.find((r) => r.assessmentId === v1.id)!.effectiveDate = "2025-02-20";
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "New Assessment created (v1)", beforeValue: null, afterValue: "Draft", timestamp: "2025-02-12" });
  logAudit({ entityType: "Document", entityId: docFY23.id, actor: "u-alice", action: "Document uploaded", beforeValue: null, afterValue: docFY23.fileName, timestamp: "2025-02-12" });
  logAudit({ entityType: "Document", entityId: docFY24.id, actor: "u-alice", action: "Document uploaded", beforeValue: null, afterValue: docFY24.fileName, timestamp: "2025-02-12" });
  logAudit({ entityType: "ExtractedField", entityId: v1.id, actor: "u-alice", action: "All fields confirmed", beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: "2025-02-13" });
  logAudit({ entityType: "Rating", entityId: v1.id, actor: "system", action: "Rating computed", beforeValue: null, afterValue: `Grade ${v1res.rating.grade}`, timestamp: "2025-02-13" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: "2025-02-14" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-priya", action: "Approval decision: Approve", beforeValue: "Submitted", afterValue: "Approved", timestamp: "2025-02-20" });

  const v2: Assessment = {
    id: "a-meridian-v2", customerId: custId, version: 2, state: "Approved", periods: ["FY2023", "FY2024", "FY2025"],
    createdBy: "u-alice", createdAt: "2026-02-16", sourceAssessmentId: v1.id,
  };
  assessments.push(v2);
  docFY23.referencedByAssessmentIds.push(v2.id);
  docFY24.referencedByAssessmentIds.push(v2.id);
  docFY25.referencedByAssessmentIds.push(v2.id);
  // FR1.7 copy-on-reuse: FY2023/FY2024 fields copied into v2's own scope (same
  // values/confidence/pointer, reset to Unconfirmed originally — shown here
  // already re-confirmed since this is a completed historical assessment).
  extractedFields.push(
    ...buildFields(v2.id, v2.periods, { FY2023: finFY23, FY2024: finFY24, FY2025: finFY25 },
      { FY2023: docFY23.id, FY2024: docFY24.id, FY2025: docFY25.id }, { confidenceSeedPrefix: "meridian-v1" }),
  );
  const v2res = finalizeAssessment(v2, v2.periods);
  approvalDecisions.push({ id: "dec-meridian-v2", assessmentId: v2.id, actor: "u-priya", action: "Approve", comments: "Trend continues to strengthen; limit increased in line with revenue growth.", timestamp: "2026-02-24" });
  recommendations.find((r) => r.assessmentId === v2.id)!.effectiveDate = "2026-02-24";
  logAudit({ entityType: "Assessment", entityId: v2.id, actor: "u-alice", action: "Refresh Assessment created (v2, source v1)", beforeValue: null, afterValue: "Draft", timestamp: "2026-02-16" });
  logAudit({ entityType: "Document", entityId: docFY25.id, actor: "u-alice", action: "Document uploaded", beforeValue: null, afterValue: docFY25.fileName, timestamp: "2026-02-16" });
  logAudit({ entityType: "ExtractedField", entityId: v2.id, actor: "system", action: "FY2023/FY2024 fields copied from v1 (FR1.7), reset to Unconfirmed", beforeValue: null, afterValue: "Unconfirmed", timestamp: "2026-02-16" });
  logAudit({ entityType: "ExtractedField", entityId: v2.id, actor: "u-alice", action: "All fields confirmed", beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: "2026-02-17" });
  logAudit({ entityType: "Rating", entityId: v2.id, actor: "system", action: "Rating computed", beforeValue: `Grade ${v1res.rating.grade}`, afterValue: `Grade ${v2res.rating.grade}`, timestamp: "2026-02-17" });
  logAudit({ entityType: "Assessment", entityId: v2.id, actor: "u-alice", action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: "2026-02-18" });
  logAudit({ entityType: "Assessment", entityId: v2.id, actor: "u-priya", action: "Approval decision: Approve", beforeValue: "Submitted", afterValue: "Approved", timestamp: "2026-02-24" });
}

// ---------------------------------------------------------------------------
// c-harborvine: one Rejected assessment — deteriorating trend, negative
// coverage; demonstrates the FR7.4 Reject path (closes assessment, reason
// required) rather than every customer ending in Approved.
// ---------------------------------------------------------------------------
{
  const custId = "c-harborvine";
  const finFY23: Record<string, number> = {
    "Cash & Equivalents": 40000, "Accounts Receivable": 620000, Inventory: 780000,
    "Total Current Assets": 1480000, "Total Assets": 2600000, "Accounts Payable": 540000,
    "Total Current Liabilities": 1380000, "Total Debt": 1450000, "Total Liabilities": 2100000,
    "Total Equity": 500000, Revenue: 5200000, "Cost of Goods Sold": 4600000, "Gross Profit": 600000,
    EBITDA: 260000, EBIT: 190000, "Interest Expense": 140000, "Net Income": 20000,
    "Operating Cash Flow": 110000, "Capital Expenditure": 60000,
  };
  const finFY24: Record<string, number> = {
    "Cash & Equivalents": 25000, "Accounts Receivable": 640000, Inventory: 810000,
    "Total Current Assets": 1510000, "Total Assets": 2650000, "Accounts Payable": 560000,
    "Total Current Liabilities": 1430000, "Total Debt": 1520000, "Total Liabilities": 2190000,
    "Total Equity": 460000, Revenue: 5050000, "Cost of Goods Sold": 4530000, "Gross Profit": 520000,
    EBITDA: 210000, EBIT: 140000, "Interest Expense": 150000, "Net Income": -25000,
    "Operating Cash Flow": 60000, "Capital Expenditure": 55000,
  };
  const finFY25: Record<string, number> = {
    "Cash & Equivalents": 15000, "Accounts Receivable": 610000, Inventory: 830000,
    "Total Current Assets": 1470000, "Total Assets": 2600000, "Accounts Payable": 580000,
    "Total Current Liabilities": 1470000, "Total Debt": 1580000, "Total Liabilities": 2260000,
    "Total Equity": 340000, Revenue: 4900000, "Cost of Goods Sold": 4460000, "Gross Profit": 440000,
    EBITDA: 150000, EBIT: 80000, "Interest Expense": 155000, "Net Income": -95000,
    "Operating Cash Flow": -10000, "Capital Expenditure": 40000,
  };
  const periods = ["FY2023", "FY2024", "FY2025"];
  const docs = periods.map(
    (p, i): AppDocument => ({
      id: `doc-harborvine-${slug(p)}`, customerId: custId, type: "unaudited", period: p, currency: "USD",
      version: 1, uploader: "u-alice", uploadDate: `2026-0${3 + i}-05`, fileName: `HarborVine_${p}_Mgmt_Accounts.xlsx`,
      referencedByAssessmentIds: [],
    }),
  );
  documents.push(...docs);
  const v1: Assessment = { id: "a-harborvine-v1", customerId: custId, version: 1, state: "Rejected", periods, createdBy: "u-alice", createdAt: "2026-03-05", sourceAssessmentId: null };
  assessments.push(v1);
  docs.forEach((d) => d.referencedByAssessmentIds.push(v1.id));
  const docIdByPeriod = Object.fromEntries(docs.map((d) => [d.period!, d.id]));
  extractedFields.push(
    ...buildFields(v1.id, periods, { FY2023: finFY23, FY2024: finFY24, FY2025: finFY25 }, docIdByPeriod, { confidenceSeedPrefix: "harborvine-v1" }),
  );
  finalizeAssessment(v1, periods);
  approvalDecisions.push({ id: "dec-harborvine-v1", assessmentId: v1.id, actor: "u-priya", action: "Reject", comments: "Negative operating cash flow and sub-1x interest coverage in FY2025, on a two-year declining trend. Recommend deferring credit extension until the business shows a stabilized cash position.", timestamp: "2026-03-19" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "New Assessment created (v1)", beforeValue: null, afterValue: "Draft", timestamp: "2026-03-05" });
  logAudit({ entityType: "ExtractedField", entityId: v1.id, actor: "u-alice", action: "All fields confirmed", beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: "2026-03-10" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: "2026-03-11" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-priya", action: "Approval decision: Reject", beforeValue: "Submitted", afterValue: "Rejected", timestamp: "2026-03-19" });
}

// c-solstice: intentionally no documents/assessments — reachable only via
// FR8.3's New Assessment search, per FR8.10's own rule.

// ---------------------------------------------------------------------------
// c-ferro: Submitted, pending approval — owned by a different analyst/team
// (u-ben), so u-alice's Customer Directory should NOT list it (NFR RBAC:
// Analyst sees own + team only), while the Approver queue and role-switch
// demo can reach it.
// ---------------------------------------------------------------------------
{
  const custId = "c-ferro";
  const periods = ["FY2024", "FY2025"];
  const fin: PeriodFinancials = {
    FY2024: synthesizeFinancials("ferro-FY2024", 0.1),
    FY2025: synthesizeFinancials("ferro-FY2025", 0.1),
  };
  const docs = periods.map(
    (p, i): AppDocument => ({
      id: `doc-ferro-${slug(p)}`, customerId: custId, type: "audited", period: p, currency: "USD",
      version: 1, uploader: "u-ben", uploadDate: `2026-0${5 + i}-02`, fileName: `Ferro_Dynamics_${p}_Audited.pdf`,
      referencedByAssessmentIds: [],
    }),
  );
  documents.push(...docs);
  const v1: Assessment = { id: "a-ferro-v1", customerId: custId, version: 1, state: "Submitted", periods, createdBy: "u-ben", createdAt: "2026-06-30", sourceAssessmentId: null };
  assessments.push(v1);
  docs.forEach((d) => d.referencedByAssessmentIds.push(v1.id));
  const docIdByPeriod = Object.fromEntries(docs.map((d) => [d.period!, d.id]));
  extractedFields.push(...buildFields(v1.id, periods, fin, docIdByPeriod, { confidenceSeedPrefix: "ferro-v1" }));
  finalizeAssessment(v1, periods);
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-ben", action: "New Assessment created (v1)", beforeValue: null, afterValue: "Draft", timestamp: "2026-06-30" });
  logAudit({ entityType: "ExtractedField", entityId: v1.id, actor: "u-ben", action: "All fields confirmed", beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: "2026-07-02" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-ben", action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: "2026-07-03" });
}

// ---------------------------------------------------------------------------
// c-palisade: Draft, mid-review — u-alice's customer, left interactively
// "unfinished" (two Unconfirmed fields -> Provisional ratios, one Not Present
// field -> Not Calculable ratios) so the Field Review screen has real work to
// do without requiring a fresh upload first. Never submitted, so FR3.10's
// gate (no Provisional at submission) is never in tension with this seed.
// The Returned-for-Revision path is demonstrated live instead: switch to
// Approver, Return the Submitted c-ferro assessment, switch back to see the
// Draft-with-Return-history banner render for real.
// ---------------------------------------------------------------------------
{
  const custId = "c-palisade";
  const periods = ["FY2024", "FY2025"];
  const fin: PeriodFinancials = {
    FY2024: synthesizeFinancials("palisade-FY2024", -0.15),
    FY2025: synthesizeFinancials("palisade-FY2025", -0.15),
  };
  const docs = periods.map(
    (p, i): AppDocument => ({
      id: `doc-palisade-${slug(p)}`, customerId: custId, type: "unaudited", period: p, currency: "USD",
      version: 1, uploader: "u-alice", uploadDate: `2026-0${6 + i}-18`, fileName: `Palisade_Foods_${p}_Mgmt_Accounts.pdf`,
      referencedByAssessmentIds: [],
    }),
  );
  documents.push(...docs);
  const v1: Assessment = { id: "a-palisade-v1", customerId: custId, version: 1, state: "Draft", periods, createdBy: "u-alice", createdAt: "2026-07-20", sourceAssessmentId: null };
  assessments.push(v1);
  docs.forEach((d) => d.referencedByAssessmentIds.push(v1.id));
  const docIdByPeriod = Object.fromEntries(docs.map((d) => [d.period!, d.id]));
  extractedFields.push(
    ...buildFields(v1.id, periods, fin, docIdByPeriod, {
      confidenceSeedPrefix: "palisade-v1",
      overrides: {
        "FY2025|Inventory": { status: "Not Present", confidenceScore: null },
        "FY2025|Interest Expense": { status: "Unconfirmed", confidenceScore: 74 },
        "FY2024|Interest Expense": { status: "Unconfirmed", confidenceScore: 68 },
      },
    }),
  );
  finalizeAssessment(v1, periods);
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "New Assessment created (v1)", beforeValue: null, afterValue: "Draft", timestamp: "2026-07-20" });
  logAudit({ entityType: "Document", entityId: docs[0].id, actor: "u-alice", action: "Document uploaded", beforeValue: null, afterValue: docs[0].fileName, timestamp: "2026-07-20" });
  logAudit({ entityType: "Document", entityId: docs[1].id, actor: "u-alice", action: "Document uploaded", beforeValue: null, afterValue: docs[1].fileName, timestamp: "2026-07-20" });
  logAudit({ entityType: "ExtractedField", entityId: v1.id, actor: "u-alice", action: "Bulk-confirmed all High-confidence fields", beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: "2026-07-21" });
}

export const seedAuditCounterStart = auditCounter;
