import type {
  AppDocument,
  ApprovalDecision,
  Assessment,
  AuditLogEntry,
  CriterionInput,
  CriterionNumber,
  Customer,
  ExtractedField,
  IntegrityCheckResult,
  RelationshipType,
  Rating,
  RiskCommentary,
  StandardFieldName,
  Ratio,
  User,
} from "../types";
import { EXTRACTION_MODEL_VERSION, FIELD_DEFS } from "./config";
import { synthesizeConfidence } from "./synthesize";
import { computeRatios } from "../engine/ratios";
import { computeIntegrityChecks } from "../engine/integrityChecks";
import { computeRating } from "../engine/rating";
import { generateRiskCommentary } from "../engine/riskCommentary";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const USERS: User[] = [
  { id: "u-alice", name: "Alice Chen" },
  { id: "u-ben", name: "Ben Osei" },
  { id: "u-priya", name: "Priya Nair" },
];
export const DEFAULT_USER_ID = "u-alice";

export const customers: Customer[] = [
  { id: "c-meridian", name: "Meridian Steel Pte Ltd", industry: "Manufacturing", relationshipOwner: "u-alice" },
  { id: "c-harborvine", name: "Harbor & Vine Wholesale", industry: "Distribution", relationshipOwner: "u-alice" },
  { id: "c-crestline", name: "Crestline Marine Supplies", industry: "Marine Equipment", relationshipOwner: "u-ben" },
  { id: "c-ferro", name: "Ferro Dynamics Pte Ltd", industry: "Industrial Equipment", relationshipOwner: "u-ben" },
  { id: "c-palisade", name: "Palisade Foods Co", industry: "Food & Beverage", relationshipOwner: "u-alice" },
  { id: "c-solstice", name: "Solstice Retail Group", industry: "Retail", relationshipOwner: "u-alice" },
];

export const documents: AppDocument[] = [];
export const assessments: Assessment[] = [];
export const extractedFields: ExtractedField[] = [];
export const criterionInputs: CriterionInput[] = [];
export const integrityChecks: IntegrityCheckResult[] = [];
export const ratios: Ratio[] = [];
export const ratings: Rating[] = [];
export const riskCommentaries: RiskCommentary[] = [];
export const approvalDecisions: ApprovalDecision[] = [];
export const auditLog: AuditLogEntry[] = [];

let auditCounter = 0;
function logAudit(entry: Omit<AuditLogEntry, "id">) {
  auditCounter += 1;
  auditLog.push({ id: `audit-${auditCounter}`, ...entry });
}

type FieldValues = Record<StandardFieldName, number | boolean>;

function buildFields(
  assessmentId: string,
  periods: string[],
  financials: Record<string, FieldValues>,
  documentIdByPeriod: Record<string, string>,
  opts: { confidenceSeedPrefix: string; unconfirmed?: Set<string> }, // unconfirmed keys: `${period}|${fieldName}`
): ExtractedField[] {
  const out: ExtractedField[] = [];
  periods.forEach((period) => {
    FIELD_DEFS.forEach((fdef, fIdx) => {
      const key = `${period}|${fdef.name}`;
      const rawValue = financials[period][fdef.name];
      const unconfirmed = opts.unconfirmed?.has(key) ?? false;
      out.push({
        id: `f-${assessmentId}-${slug(period)}-${slug(fdef.name)}`,
        assessmentId,
        documentId: documentIdByPeriod[period],
        fieldName: fdef.name,
        section: fdef.section,
        period,
        value: rawValue,
        originalExtractedValue: rawValue,
        scaleApplied: "units",
        currency: "SGD",
        confidenceScore: synthesizeConfidence(`${opts.confidenceSeedPrefix}-${period}-${fdef.name}`),
        sourcePointer: `p.${2 + (fIdx % 6)}, ${fdef.section}, row '${fdef.name}' (${period})`,
        extractionModelVersion: EXTRACTION_MODEL_VERSION,
        status: unconfirmed ? "Unconfirmed" : "Confirmed",
        amendmentHistory: [],
      });
    });
  });
  return out;
}

interface CriterionSeed {
  5?: { paidUpCapital: number; totalExposure: number; source: "registry" | "statement-note" | "manual" };
  7?: { yearRegisteredSg: number };
  8?: { litigationRecord: "Clean" | "Motor suits only" | "Other record" };
  9?: { changeInDirectors: boolean };
  11?: { promptPaymentRecord: "Good" | "Late" | "None held" };
}

function buildCriterionInputs(assessmentId: string, relationshipType: RelationshipType, seedValues: CriterionSeed, confirmedBy: string, confirmedAt: string, unconfirmed?: Set<CriterionNumber>): CriterionInput[] {
  const numbers: CriterionNumber[] = [5, 7, 8, 9, 11];
  return numbers.map((n) => {
    const isUnconfirmed = unconfirmed?.has(n) ?? (n === 11 && relationshipType === "New");
    const base: CriterionInput = {
      id: `crit-${assessmentId}-${n}`,
      assessmentId,
      criterionNumber: n,
      paidUpCapital: null,
      totalExposure: null,
      currency: null,
      source: null,
      sourceDocumentId: null,
      yearRegisteredSg: null,
      litigationRecord: null,
      changeInDirectors: null,
      promptPaymentRecord: null,
      evidenceSource: null,
      evidencePeriodOrDate: null,
      status: isUnconfirmed ? "Unconfirmed" : "Confirmed",
      amendmentHistory: [],
      enteredBy: isUnconfirmed ? null : confirmedBy,
      confirmedBy: isUnconfirmed ? null : confirmedBy,
      confirmedAt: isUnconfirmed ? null : confirmedAt,
    };
    if (n === 5 && seedValues[5]) {
      base.paidUpCapital = seedValues[5].paidUpCapital;
      base.totalExposure = seedValues[5].totalExposure;
      base.currency = "SGD";
      base.source = seedValues[5].source;
    }
    if (n === 7 && seedValues[7]) base.yearRegisteredSg = seedValues[7].yearRegisteredSg;
    if (n === 8 && seedValues[8]) {
      base.litigationRecord = seedValues[8].litigationRecord;
      base.evidenceSource = "Commercial court-records search";
      base.evidencePeriodOrDate = confirmedAt;
    }
    if (n === 9 && seedValues[9]) base.changeInDirectors = seedValues[9].changeInDirectors;
    if (n === 11 && seedValues[11] && !isUnconfirmed) {
      base.promptPaymentRecord = seedValues[11].promptPaymentRecord;
      base.evidenceSource = "AR ageing system";
      base.evidencePeriodOrDate = "past 12 months";
    }
    return base;
  });
}

function finalizeAssessment(assessment: Assessment, now: string) {
  const fields = extractedFields.filter((f) => f.assessmentId === assessment.id);
  const inputs = criterionInputs.filter((c) => c.assessmentId === assessment.id);
  const currentPeriod = assessment.periods[assessment.periods.length - 1];
  const priorPeriod = assessment.periods[0];

  const checks = computeIntegrityChecks(assessment.id, fields, assessment.periods, currentPeriod, priorPeriod, now);
  integrityChecks.push(...checks);

  const confirmedFields = fields.filter((f) => f.status !== "Unconfirmed");
  const confirmedInputs = inputs.filter((c) => c.status !== "Unconfirmed");
  const rs = computeRatios(assessment.id, confirmedFields, confirmedInputs, currentPeriod, priorPeriod, assessment.assessmentYear, now);
  ratios.push(...rs);
  const rating = computeRating(assessment.id, rs, confirmedInputs, confirmedFields, currentPeriod, assessment.relationshipType, now);
  ratings.push(rating);
  const commentary = generateRiskCommentary(assessment.id, rating.id, rating, rs, confirmedFields, confirmedInputs, currentPeriod, priorPeriod, now);
  riskCommentaries.push(commentary);
  return { rating, commentary };
}

// ---------------------------------------------------------------------------
// c-meridian, division "Trade Finance": v1 New/Approved (clean, Class A, no
// commentary observations) then v2 Renewal/Approved (Class B, deliberately
// weaker trend — fires Trajectory observations). Also assessed independently
// in division "Working Capital Solutions" (FR8.1/FR5.13 division scoping).
// ---------------------------------------------------------------------------
{
  const custId = "c-meridian";
  const division = "Trade Finance";

  // v1 — New, Class A
  const v1Fin: Record<string, FieldValues> = {
    FY2024: {
      Sales: 2_600_000, NPAT: 700_000, "Current Assets": 1_500_000, "Cash and Bank Balances": 700_000,
      "Non-Current Assets": 1_000_000, "Total Assets": 2_500_000, "Current Liabilities": 550_000,
      "Non-Current Liabilities": 250_000, "Total Liabilities": 800_000, "Total Equity": 1_700_000,
      "Net Operating Cash Flow Positive": true,
    },
    FY2025: {
      Sales: 3_000_000, NPAT: 1_000_000, "Current Assets": 1_800_000, "Cash and Bank Balances": 900_000,
      "Non-Current Assets": 1_200_000, "Total Assets": 3_000_000, "Current Liabilities": 500_000,
      "Non-Current Liabilities": 300_000, "Total Liabilities": 800_000, "Total Equity": 2_200_000,
      "Net Operating Cash Flow Positive": true,
    },
  };
  const docFY24: AppDocument = { id: "doc-meridian-tf-fy24", assessmentId: "a-meridian-tf-v1", type: "audited", period: "FY2024", financialsDate: "2025-01-15", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-alice", uploadDate: "2025-02-10", fileName: "Meridian_Steel_FY2024_Audited.pdf", supersedesDocumentId: null };
  const docFY25: AppDocument = { id: "doc-meridian-tf-fy25", assessmentId: "a-meridian-tf-v1", type: "audited", period: "FY2025", financialsDate: "2026-01-20", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-alice", uploadDate: "2026-02-10", fileName: "Meridian_Steel_FY2025_Audited.pdf", supersedesDocumentId: null };
  const docRegistry: AppDocument = { id: "doc-meridian-tf-registry", assessmentId: "a-meridian-tf-v1", type: "registry", period: null, financialsDate: null, presentationCurrency: null, presentationScale: null, statementBasis: null, version: 1, uploader: "u-alice", uploadDate: "2025-02-10", fileName: "Meridian_Steel_ACRA_Bizfile.pdf", supersedesDocumentId: null };
  documents.push(docFY24, docFY25, docRegistry);

  const v1: Assessment = {
    id: "a-meridian-tf-v1", customerId: custId, division, version: 1, state: "Approved", relationshipType: "New",
    relationshipTypeOverridden: false, relationshipTypeOverrideReason: null, assessmentYear: 2025, recencyFlag: "Recent",
    periods: ["FY2024", "FY2025"], productType: "Trade credit facility", contractStartDate: "2025-03-01", contractPeriodMonths: 12,
    contractValueOrAverageDemand: 500_000, principalActivities: "Steel fabrication and supply", parentageShareholding: "Independent, family-owned",
    auditedFinancialsFlag: true, createdBy: "u-alice", createdAt: "2025-02-12", submittedBy: "u-alice", submittedAt: "2025-02-14",
  };
  assessments.push(v1);
  extractedFields.push(...buildFields(v1.id, v1.periods, v1Fin, { FY2024: docFY24.id, FY2025: docFY25.id }, { confidenceSeedPrefix: "meridian-tf-v1" }));
  criterionInputs.push(
    ...buildCriterionInputs(
      v1.id, v1.relationshipType,
      { 5: { paidUpCapital: 1_200_000, totalExposure: 500_000, source: "registry" }, 7: { yearRegisteredSg: 2010 }, 8: { litigationRecord: "Clean" }, 9: { changeInDirectors: false } },
      "u-alice", "2025-02-13",
    ),
  );
  const v1res = finalizeAssessment(v1, "2025-02-13");
  approvalDecisions.push({ id: "dec-meridian-tf-v1", assessmentId: v1.id, actor: "u-priya", action: "Approve", comments: "Strong liquidity and coverage across the board; approved as proposed.", timestamp: "2025-02-20", policyVersion: "mvp-allow-all-v1" });
  assessments.find((a) => a.id === v1.id)!.state = "Approved";
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "New Assessment created (v1, New, Trade Finance)", beforeValue: null, afterValue: "Draft", timestamp: "2025-02-12" });
  logAudit({ entityType: "Rating", entityId: v1.id, actor: "system", action: "Rating computed", beforeValue: null, afterValue: `Class ${v1res.rating.ratingClass} (${v1res.rating.compositeScore})`, timestamp: "2025-02-13" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: "2025-02-14" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-priya", action: "Approval decision: Approve", beforeValue: "Submitted", afterValue: "Approved", timestamp: "2025-02-20" });

  // v2 — Renewal (derived from v1's Approved history), Class B, weaker trend
  const v2Fin: Record<string, FieldValues> = {
    FY2025: {
      Sales: 2_800_000, NPAT: 200_000, "Current Assets": 1_800_000, "Cash and Bank Balances": 900_000,
      "Non-Current Assets": 1_000_000, "Total Assets": 2_800_000, "Current Liabilities": 500_000,
      "Non-Current Liabilities": 250_000, "Total Liabilities": 750_000, "Total Equity": 2_050_000,
      "Net Operating Cash Flow Positive": true,
    },
    FY2026: {
      Sales: 3_700_000, NPAT: 480_000, "Current Assets": 1_320_000, "Cash and Bank Balances": 300_000,
      "Non-Current Assets": 1_600_000, "Total Assets": 2_920_000, "Current Liabilities": 600_000,
      "Non-Current Liabilities": 400_000, "Total Liabilities": 1_000_000, "Total Equity": 1_920_000,
      "Net Operating Cash Flow Positive": true,
    },
  };
  const docV2FY25: AppDocument = { id: "doc-meridian-tf-v2-fy25", assessmentId: "a-meridian-tf-v2", type: "audited", period: "FY2025", financialsDate: "2026-02-01", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-alice", uploadDate: "2026-06-01", fileName: "Meridian_Steel_FY2025_Audited_v2.pdf", supersedesDocumentId: null };
  const docV2FY26: AppDocument = { id: "doc-meridian-tf-v2-fy26", assessmentId: "a-meridian-tf-v2", type: "unaudited", period: "FY2026", financialsDate: "2026-08-15", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-alice", uploadDate: "2026-09-01", fileName: "Meridian_Steel_FY2026_Mgmt_Accounts.xlsx", supersedesDocumentId: null };
  documents.push(docV2FY25, docV2FY26);

  const v2: Assessment = {
    id: "a-meridian-tf-v2", customerId: custId, division, version: 2, state: "Approved", relationshipType: "Renewal",
    relationshipTypeOverridden: false, relationshipTypeOverrideReason: null, assessmentYear: 2026, recencyFlag: "Recent",
    periods: ["FY2025", "FY2026"], productType: "Trade credit facility", contractStartDate: "2026-03-01", contractPeriodMonths: 12,
    contractValueOrAverageDemand: 600_000, principalActivities: "Steel fabrication and supply", parentageShareholding: "Independent, family-owned",
    auditedFinancialsFlag: false, createdBy: "u-alice", createdAt: "2026-06-01", submittedBy: "u-alice", submittedAt: "2026-09-02",
  };
  assessments.push(v2);
  extractedFields.push(...buildFields(v2.id, v2.periods, v2Fin, { FY2025: docV2FY25.id, FY2026: docV2FY26.id }, { confidenceSeedPrefix: "meridian-tf-v2" }));
  criterionInputs.push(
    ...buildCriterionInputs(
      v2.id, v2.relationshipType,
      { 5: { paidUpCapital: 1_200_000, totalExposure: 800_000, source: "manual" }, 7: { yearRegisteredSg: 2010 }, 8: { litigationRecord: "Other record" }, 9: { changeInDirectors: true }, 11: { promptPaymentRecord: "Late" } },
      "u-alice", "2026-09-01",
    ),
  );
  const v2res = finalizeAssessment(v2, "2026-09-01");
  approvalDecisions.push({ id: "dec-meridian-tf-v2", assessmentId: v2.id, actor: "u-priya", action: "Approve", comments: "Trend has softened since the last renewal — approved with tighter monitoring, not declined.", timestamp: "2026-09-08", policyVersion: "mvp-allow-all-v1" });
  logAudit({ entityType: "Assessment", entityId: v2.id, actor: "u-alice", action: "New Assessment created (v2, Renewal, Trade Finance)", beforeValue: null, afterValue: "Draft", timestamp: "2026-06-01" });
  logAudit({ entityType: "Rating", entityId: v2.id, actor: "system", action: "Rating computed", beforeValue: `Class ${v1res.rating.ratingClass}`, afterValue: `Class ${v2res.rating.ratingClass} (${v2res.rating.compositeScore})`, timestamp: "2026-09-01" });
  logAudit({ entityType: "RiskCommentary", entityId: v2.id, actor: "system", action: v2res.commentary.noObservations ? "Risk commentary generated — no observations" : `Risk commentary generated — ${v2res.commentary.observations.length} observation(s)`, beforeValue: null, afterValue: null, timestamp: "2026-09-01" });
  logAudit({ entityType: "Assessment", entityId: v2.id, actor: "u-alice", action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: "2026-09-02" });
  logAudit({ entityType: "Assessment", entityId: v2.id, actor: "u-priya", action: "Approval decision: Approve", beforeValue: "Submitted", afterValue: "Approved", timestamp: "2026-09-08" });

  // Same customer, independent division — New (Trade Finance's Approved
  // history does not carry over), demonstrates FR8.1/FR5.13 division scoping.
  const wcsDivision = "Working Capital Solutions";
  const wcsFin: Record<string, FieldValues> = v1Fin;
  const docWcsFY24: AppDocument = { id: "doc-meridian-wcs-fy24", assessmentId: "a-meridian-wcs-v1", type: "audited", period: "FY2024", financialsDate: "2025-01-15", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-ben", uploadDate: "2025-04-05", fileName: "Meridian_Steel_FY2024_Audited.pdf", supersedesDocumentId: null };
  const docWcsFY25: AppDocument = { id: "doc-meridian-wcs-fy25", assessmentId: "a-meridian-wcs-v1", type: "audited", period: "FY2025", financialsDate: "2026-01-20", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-ben", uploadDate: "2026-04-05", fileName: "Meridian_Steel_FY2025_Audited.pdf", supersedesDocumentId: null };
  documents.push(docWcsFY24, docWcsFY25);
  const wcs: Assessment = {
    id: "a-meridian-wcs-v1", customerId: custId, division: wcsDivision, version: 1, state: "Approved", relationshipType: "New",
    relationshipTypeOverridden: false, relationshipTypeOverrideReason: null, assessmentYear: 2026, recencyFlag: "Recent",
    periods: ["FY2024", "FY2025"], productType: "Working capital line", contractStartDate: "2026-05-01", contractPeriodMonths: 12,
    contractValueOrAverageDemand: 350_000, principalActivities: "Steel fabrication and supply", parentageShareholding: "Independent, family-owned",
    auditedFinancialsFlag: true, createdBy: "u-ben", createdAt: "2026-04-05", submittedBy: "u-ben", submittedAt: "2026-04-08",
  };
  assessments.push(wcs);
  extractedFields.push(...buildFields(wcs.id, wcs.periods, wcsFin, { FY2024: docWcsFY24.id, FY2025: docWcsFY25.id }, { confidenceSeedPrefix: "meridian-wcs-v1" }));
  criterionInputs.push(
    ...buildCriterionInputs(
      wcs.id, wcs.relationshipType,
      { 5: { paidUpCapital: 1_200_000, totalExposure: 350_000, source: "manual" }, 7: { yearRegisteredSg: 2010 }, 8: { litigationRecord: "Clean" }, 9: { changeInDirectors: false } },
      "u-ben", "2026-04-07",
    ),
  );
  finalizeAssessment(wcs, "2026-04-07");
  approvalDecisions.push({ id: "dec-meridian-wcs-v1", assessmentId: wcs.id, actor: "u-priya", action: "Approve", comments: "Independent assessment for the working capital line — same strong fundamentals as Trade Finance.", timestamp: "2026-04-12", policyVersion: "mvp-allow-all-v1" });
  logAudit({ entityType: "Assessment", entityId: wcs.id, actor: "u-ben", action: "New Assessment created (v1, New, Working Capital Solutions)", beforeValue: null, afterValue: "Draft", timestamp: "2026-04-05" });
  logAudit({ entityType: "Assessment", entityId: wcs.id, actor: "u-priya", action: "Approval decision: Approve", beforeValue: "Submitted", afterValue: "Approved", timestamp: "2026-04-12" });
}

// ---------------------------------------------------------------------------
// c-harborvine: high-leverage Class C, Rejected — and a deliberately broken
// FY2026 balance sheet (Total Assets overstated) to demonstrate FR3.6/3.7
// integrity-check failures and FR3.13's ranked discrepancy attribution.
// ---------------------------------------------------------------------------
{
  const custId = "c-harborvine";
  const division = "Trade Finance";
  const fin: Record<string, FieldValues> = {
    FY2025: {
      Sales: 1_600_000, NPAT: 50_000, "Current Assets": 650_000, "Cash and Bank Balances": 140_000,
      "Non-Current Assets": 550_000, "Total Assets": 1_200_000, "Current Liabilities": 600_000,
      "Non-Current Liabilities": 250_000, "Total Liabilities": 850_000, "Total Equity": 350_000,
      "Net Operating Cash Flow Positive": true,
    },
    FY2026: {
      Sales: 1_800_000, NPAT: -40_000,
      "Current Assets": 700_000, "Cash and Bank Balances": 150_000,
      "Non-Current Assets": 600_000,
      // Deliberately overstated — CA + NCA = 1,300,000, but Total Assets is
      // recorded as 1,400,000. Fails total_assets_eq_ca_plus_nca and, since
      // TE+TL no longer matches this figure either, equity_plus_liabilities_eq_assets.
      "Total Assets": 1_400_000,
      "Current Liabilities": 650_000, "Non-Current Liabilities": 250_000, "Total Liabilities": 900_000,
      "Total Equity": 400_000,
      "Net Operating Cash Flow Positive": false,
    },
  };
  const docFY25: AppDocument = { id: "doc-harborvine-fy25", assessmentId: "a-harborvine-v1", type: "unaudited", period: "FY2025", financialsDate: "2026-02-01", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-alice", uploadDate: "2026-03-05", fileName: "HarborVine_FY2025_Mgmt_Accounts.xlsx", supersedesDocumentId: null };
  const docFY26: AppDocument = { id: "doc-harborvine-fy26", assessmentId: "a-harborvine-v1", type: "unaudited", period: "FY2026", financialsDate: "2026-08-20", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-alice", uploadDate: "2026-09-03", fileName: "HarborVine_FY2026_Mgmt_Accounts.xlsx", supersedesDocumentId: null };
  documents.push(docFY25, docFY26);

  const v1: Assessment = {
    id: "a-harborvine-v1", customerId: custId, division, version: 1, state: "Rejected", relationshipType: "New",
    relationshipTypeOverridden: false, relationshipTypeOverrideReason: null, assessmentYear: 2026, recencyFlag: "Recent",
    periods: ["FY2025", "FY2026"], productType: "Trade credit facility", contractStartDate: null, contractPeriodMonths: null,
    contractValueOrAverageDemand: 500_000, principalActivities: "Wholesale beverage distribution", parentageShareholding: "Independent",
    auditedFinancialsFlag: false, createdBy: "u-alice", createdAt: "2026-09-03", submittedBy: "u-alice", submittedAt: "2026-09-10",
  };
  assessments.push(v1);
  extractedFields.push(...buildFields(v1.id, v1.periods, fin, { FY2025: docFY25.id, FY2026: docFY26.id }, { confidenceSeedPrefix: "harborvine-v1" }));
  criterionInputs.push(
    ...buildCriterionInputs(
      v1.id, v1.relationshipType,
      { 5: { paidUpCapital: 150_000, totalExposure: 500_000, source: "manual" }, 7: { yearRegisteredSg: 2015 }, 8: { litigationRecord: "Other record" }, 9: { changeInDirectors: true } },
      "u-alice", "2026-09-09",
    ),
  );
  const res = finalizeAssessment(v1, "2026-09-09");
  approvalDecisions.push({ id: "dec-harborvine-v1", assessmentId: v1.id, actor: "u-priya", action: "Reject", comments: "High leverage (D/E > 2), a current-period loss, and an unresolved balance-sheet discrepancy on Total Assets. Recommend re-submission once the FY2026 figures are corrected and the trend stabilizes.", timestamp: "2026-09-18", policyVersion: "mvp-allow-all-v1" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "New Assessment created (v1, New, Trade Finance)", beforeValue: null, afterValue: "Draft", timestamp: "2026-09-03" });
  logAudit({ entityType: "IntegrityCheckResult", entityId: v1.id, actor: "system", action: "Integrity checks evaluated — FY2026 Total Assets fails balance (FR3.13 discrepancy ranking attached)", beforeValue: null, afterValue: null, timestamp: "2026-09-03" });
  logAudit({ entityType: "Rating", entityId: v1.id, actor: "system", action: "Rating computed", beforeValue: null, afterValue: `Class ${res.rating.ratingClass} (${res.rating.compositeScore})`, timestamp: "2026-09-09" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: "2026-09-10" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-priya", action: "Approval decision: Reject", beforeValue: "Submitted", afterValue: "Rejected", timestamp: "2026-09-18" });
}

// ---------------------------------------------------------------------------
// c-crestline: negative equity, Class C, Rejected — also fires the Capital
// erosion Risk Commentary observation (Total Equity well below paid-up
// capital). Demonstrates FR6.13's "current-period loss dominates" rule: the
// prior period was profitable, the current period is not, and criterion 6
// scores tier 1 regardless.
// ---------------------------------------------------------------------------
{
  const custId = "c-crestline";
  const division = "Trade Finance";
  const fin: Record<string, FieldValues> = {
    FY2025: {
      Sales: 1_800_000, NPAT: 80_000, "Current Assets": 550_000, "Cash and Bank Balances": 90_000,
      "Non-Current Assets": 850_000, "Total Assets": 1_400_000, "Current Liabilities": 500_000,
      "Non-Current Liabilities": 750_000, "Total Liabilities": 1_250_000, "Total Equity": 150_000,
      "Net Operating Cash Flow Positive": true,
    },
    FY2026: {
      Sales: 2_000_000, NPAT: -150_000, "Current Assets": 600_000, "Cash and Bank Balances": 100_000,
      "Non-Current Assets": 900_000, "Total Assets": 1_500_000, "Current Liabilities": 550_000,
      "Non-Current Liabilities": 1_050_000, "Total Liabilities": 1_600_000, "Total Equity": -100_000,
      "Net Operating Cash Flow Positive": false,
    },
  };
  const docFY25: AppDocument = { id: "doc-crestline-fy25", assessmentId: "a-crestline-v1", type: "unaudited", period: "FY2025", financialsDate: "2026-01-10", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-ben", uploadDate: "2026-07-01", fileName: "Crestline_FY2025_Mgmt_Accounts.xlsx", supersedesDocumentId: null };
  const docFY26: AppDocument = { id: "doc-crestline-fy26", assessmentId: "a-crestline-v1", type: "unaudited", period: "FY2026", financialsDate: "2026-08-10", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-ben", uploadDate: "2026-09-01", fileName: "Crestline_FY2026_Mgmt_Accounts.xlsx", supersedesDocumentId: null };
  documents.push(docFY25, docFY26);

  const v1: Assessment = {
    id: "a-crestline-v1", customerId: custId, division, version: 1, state: "Rejected", relationshipType: "New",
    relationshipTypeOverridden: false, relationshipTypeOverrideReason: null, assessmentYear: 2026, recencyFlag: "Recent",
    periods: ["FY2025", "FY2026"], productType: "Trade credit facility", contractStartDate: null, contractPeriodMonths: null,
    contractValueOrAverageDemand: 300_000, principalActivities: "Marine equipment supply", parentageShareholding: "Independent",
    auditedFinancialsFlag: false, createdBy: "u-ben", createdAt: "2026-09-01", submittedBy: "u-ben", submittedAt: "2026-09-05",
  };
  assessments.push(v1);
  extractedFields.push(...buildFields(v1.id, v1.periods, fin, { FY2025: docFY25.id, FY2026: docFY26.id }, { confidenceSeedPrefix: "crestline-v1" }));
  criterionInputs.push(
    ...buildCriterionInputs(
      v1.id, v1.relationshipType,
      { 5: { paidUpCapital: 80_000, totalExposure: 300_000, source: "manual" }, 7: { yearRegisteredSg: 2023 }, 8: { litigationRecord: "Other record" }, 9: { changeInDirectors: true } },
      "u-ben", "2026-09-04",
    ),
  );
  const res = finalizeAssessment(v1, "2026-09-04");
  approvalDecisions.push({ id: "dec-crestline-v1", assessmentId: v1.id, actor: "u-priya", action: "Reject", comments: "Negative equity and a current-period loss against a very young Singapore registration. Not recommended at this time.", timestamp: "2026-09-12", policyVersion: "mvp-allow-all-v1" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-ben", action: "New Assessment created (v1, New, Trade Finance)", beforeValue: null, afterValue: "Draft", timestamp: "2026-09-01" });
  logAudit({ entityType: "Rating", entityId: v1.id, actor: "system", action: "Rating computed", beforeValue: null, afterValue: `Class ${res.rating.ratingClass} (${res.rating.compositeScore})`, timestamp: "2026-09-04" });
  logAudit({ entityType: "RiskCommentary", entityId: v1.id, actor: "system", action: `Risk commentary generated — ${res.commentary.observations.length} observation(s), incl. capital erosion`, beforeValue: null, afterValue: null, timestamp: "2026-09-04" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-ben", action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: "2026-09-05" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-priya", action: "Approval decision: Reject", beforeValue: "Submitted", afterValue: "Rejected", timestamp: "2026-09-12" });
}

// ---------------------------------------------------------------------------
// c-ferro: zero equity (the third of criterion 4's tier-1 routes, distinct
// from negative equity — FR6.10), Submitted and pending decision, and a
// Non-Recent statement (FR3.12 — financials_date over 540 days old).
// ---------------------------------------------------------------------------
{
  const custId = "c-ferro";
  const division = "Structured Trade";
  const fin: Record<string, FieldValues> = {
    FY2022: {
      Sales: 2_200_000, NPAT: -20_000, "Current Assets": 550_000, "Cash and Bank Balances": 170_000,
      "Non-Current Assets": 850_000, "Total Assets": 1_400_000, "Current Liabilities": 480_000,
      "Non-Current Liabilities": 570_000, "Total Liabilities": 1_050_000, "Total Equity": 350_000,
      "Net Operating Cash Flow Positive": true,
    },
    FY2023: {
      Sales: 2_500_000, NPAT: 100_000, "Current Assets": 600_000, "Cash and Bank Balances": 200_000,
      "Non-Current Assets": 900_000,
      "Total Assets": 1_500_000,
      "Current Liabilities": 500_000, "Non-Current Liabilities": 1_000_000, "Total Liabilities": 1_500_000,
      // Total Assets - Total Liabilities = 0 exactly — the zero-equity route.
      "Total Equity": 0,
      "Net Operating Cash Flow Positive": true,
    },
  };
  // financials_date fixed well over 540 days before any realistic "today" in
  // this prototype's operating window — FR3.12's Non-Recent flag.
  const docFY22: AppDocument = { id: "doc-ferro-fy22", assessmentId: "a-ferro-v1", type: "audited", period: "FY2022", financialsDate: "2022-12-31", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-ben", uploadDate: "2023-01-20", fileName: "Ferro_Dynamics_FY2022_Audited.pdf", supersedesDocumentId: null };
  const docFY23: AppDocument = { id: "doc-ferro-fy23", assessmentId: "a-ferro-v1", type: "audited", period: "FY2023", financialsDate: "2023-12-31", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-ben", uploadDate: "2024-01-25", fileName: "Ferro_Dynamics_FY2023_Audited.pdf", supersedesDocumentId: null };
  documents.push(docFY22, docFY23);

  const v1: Assessment = {
    id: "a-ferro-v1", customerId: custId, division, version: 1, state: "Submitted", relationshipType: "New",
    relationshipTypeOverridden: false, relationshipTypeOverrideReason: null, assessmentYear: 2024, recencyFlag: "Non-Recent",
    periods: ["FY2022", "FY2023"], productType: "Structured trade facility", contractStartDate: null, contractPeriodMonths: null,
    contractValueOrAverageDemand: 250_000, principalActivities: "Industrial equipment leasing", parentageShareholding: "Independent",
    auditedFinancialsFlag: true, createdBy: "u-ben", createdAt: "2024-02-01", submittedBy: "u-ben", submittedAt: "2024-02-10",
  };
  assessments.push(v1);
  extractedFields.push(...buildFields(v1.id, v1.periods, fin, { FY2022: docFY22.id, FY2023: docFY23.id }, { confidenceSeedPrefix: "ferro-v1" }));
  criterionInputs.push(
    ...buildCriterionInputs(
      v1.id, v1.relationshipType,
      { 5: { paidUpCapital: 400_000, totalExposure: 250_000, source: "manual" }, 7: { yearRegisteredSg: 2018 }, 8: { litigationRecord: "Clean" }, 9: { changeInDirectors: false } },
      "u-ben", "2024-02-08",
    ),
  );
  const res = finalizeAssessment(v1, "2024-02-08");
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-ben", action: "New Assessment created (v1, New, Structured Trade)", beforeValue: null, afterValue: "Draft", timestamp: "2024-02-01" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "system", action: "Statement recency flag: Non-Recent (FR3.12)", beforeValue: null, afterValue: "Non-Recent", timestamp: "2024-02-01" });
  logAudit({ entityType: "Rating", entityId: v1.id, actor: "system", action: "Rating computed", beforeValue: null, afterValue: `Class ${res.rating.ratingClass} (${res.rating.compositeScore})`, timestamp: "2024-02-08" });
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-ben", action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: "2024-02-10" });
}

// c-solstice: intentionally no documents/assessments — reachable only via
// FR8.3's Prepare Assessment search.

// ---------------------------------------------------------------------------
// c-palisade: Draft, mid-review — several fields and one criterion input left
// Unconfirmed, so the FR3.8 gate blocks compute entirely. No ratios, rating,
// or commentary exist for this assessment, demonstrating that the hard gate
// really does withhold every computed result, not just the score.
// ---------------------------------------------------------------------------
{
  const custId = "c-palisade";
  const division = "Trade Finance";
  const fin: Record<string, FieldValues> = {
    FY2025: {
      Sales: 1_900_000, NPAT: 60_000, "Current Assets": 500_000, "Cash and Bank Balances": 120_000,
      "Non-Current Assets": 700_000, "Total Assets": 1_200_000, "Current Liabilities": 450_000,
      "Non-Current Liabilities": 350_000, "Total Liabilities": 800_000, "Total Equity": 400_000,
      "Net Operating Cash Flow Positive": true,
    },
    FY2026: {
      Sales: 2_000_000, NPAT: 90_000, "Current Assets": 540_000, "Cash and Bank Balances": 130_000,
      "Non-Current Assets": 720_000, "Total Assets": 1_260_000, "Current Liabilities": 460_000,
      "Non-Current Liabilities": 360_000, "Total Liabilities": 820_000, "Total Equity": 440_000,
      "Net Operating Cash Flow Positive": true,
    },
  };
  const docFY25: AppDocument = { id: "doc-palisade-fy25", assessmentId: "a-palisade-v1", type: "unaudited", period: "FY2025", financialsDate: "2026-01-05", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-alice", uploadDate: "2026-07-18", fileName: "Palisade_Foods_FY2025_Mgmt_Accounts.pdf", supersedesDocumentId: null };
  const docFY26: AppDocument = { id: "doc-palisade-fy26", assessmentId: "a-palisade-v1", type: "unaudited", period: "FY2026", financialsDate: "2026-07-01", presentationCurrency: "SGD", presentationScale: "units", statementBasis: "standalone", version: 1, uploader: "u-alice", uploadDate: "2026-07-19", fileName: "Palisade_Foods_FY2026_Mgmt_Accounts.pdf", supersedesDocumentId: null };
  documents.push(docFY25, docFY26);

  const v1: Assessment = {
    id: "a-palisade-v1", customerId: custId, division, version: 1, state: "Draft", relationshipType: "New",
    relationshipTypeOverridden: false, relationshipTypeOverrideReason: null, assessmentYear: 2026, recencyFlag: "Recent",
    periods: ["FY2025", "FY2026"], productType: "Trade credit facility", contractStartDate: null, contractPeriodMonths: null,
    contractValueOrAverageDemand: 200_000, principalActivities: "Packaged food distribution", parentageShareholding: "Independent",
    auditedFinancialsFlag: false, createdBy: "u-alice", createdAt: "2026-07-20", submittedBy: null, submittedAt: null,
  };
  assessments.push(v1);
  extractedFields.push(
    ...buildFields(v1.id, v1.periods, fin, { FY2025: docFY25.id, FY2026: docFY26.id }, {
      confidenceSeedPrefix: "palisade-v1",
      unconfirmed: new Set(["FY2026|Non-Current Liabilities", "FY2026|Total Liabilities", "FY2025|Cash and Bank Balances"]),
    }),
  );
  criterionInputs.push(
    ...buildCriterionInputs(
      v1.id, v1.relationshipType,
      { 5: { paidUpCapital: 300_000, totalExposure: 200_000, source: "manual" }, 8: { litigationRecord: "Clean" }, 9: { changeInDirectors: false } },
      "u-alice", "2026-07-21",
      new Set([7]), // year registered in SG left Unconfirmed
    ),
  );
  logAudit({ entityType: "Assessment", entityId: v1.id, actor: "u-alice", action: "New Assessment created (v1, New, Trade Finance)", beforeValue: null, afterValue: "Draft", timestamp: "2026-07-20" });
  logAudit({ entityType: "Document", entityId: docFY25.id, actor: "u-alice", action: "Document uploaded", beforeValue: null, afterValue: docFY25.fileName, timestamp: "2026-07-20" });
  logAudit({ entityType: "Document", entityId: docFY26.id, actor: "u-alice", action: "Document uploaded", beforeValue: null, afterValue: docFY26.fileName, timestamp: "2026-07-20" });
  logAudit({ entityType: "ExtractedField", entityId: v1.id, actor: "u-alice", action: "Bulk-confirmed High-confidence fields; 3 fields and criterion 7 remain Unconfirmed — review gate holds (FR3.8)", beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: "2026-07-21" });
  // Integrity checks still run — they're not gated by review completeness (Field Review.md Flow C).
  const fields = extractedFields.filter((f) => f.assessmentId === v1.id);
  integrityChecks.push(...computeIntegrityChecks(v1.id, fields, v1.periods, "FY2026", "FY2025", "2026-07-21"));
}

export const seedAuditCounterStart = auditCounter;
