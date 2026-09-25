import { create } from "zustand";
import type {
  AmendmentHistoryEntry,
  AppDocument,
  ApprovalDecision,
  Assessment,
  AuditLogEntry,
  CriterionInput,
  CriterionInputStatus,
  CriterionNumber,
  Customer,
  DocumentType,
  ExtractedField,
  FieldStatus,
  IntegrityCheckResult,
  LitigationRecord,
  PresentationScale,
  PromptPaymentRecord,
  Rating,
  RelationshipType,
  RiskCommentary,
  Ratio,
  StatementBasis,
} from "../types";
import {
  USERS,
  approvalDecisions as seedApprovalDecisions,
  assessments as seedAssessments,
  auditLog as seedAuditLog,
  criterionInputs as seedCriterionInputs,
  customers as seedCustomers,
  documents as seedDocuments,
  extractedFields as seedExtractedFields,
  integrityChecks as seedIntegrityChecks,
  ratings as seedRatings,
  ratios as seedRatios,
  riskCommentaries as seedRiskCommentaries,
} from "../data/seed";
import { CONFIDENCE_THRESHOLDS, EXTRACTION_MODEL_VERSION, FIELD_DEFS, RECENCY_THRESHOLD_DAYS } from "../data/config";
import { synthesizeConfidence, synthesizeFinancials, synthesizePaidUpCapital } from "../data/synthesize";
import { computeRatios } from "../engine/ratios";
import { computeIntegrityChecks } from "../engine/integrityChecks";
import { computeRating } from "../engine/rating";
import { generateRiskCommentary } from "../engine/riskCommentary";
import { deriveRelationshipType, liveExtractedFields, openAssessmentForPair, reviewComplete } from "./selectors";

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}-${idCounter++}`;
const nowISO = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString();

interface ActionResult {
  ok: boolean;
  reason?: string;
}

// FR7.3/7.7 — named authorization guards, the only place role/scope/SoD logic
// may ever live. Allow-any at MVP; a V2 SoD rule becomes a one-line edit
// inside canApprove, no call-site changes.
function canSubmit(_assessment: Assessment, _actor: string): ActionResult {
  return { ok: true };
}
function canApprove(_assessment: Assessment, _actor: string): ActionResult {
  return { ok: true };
}
function canReturn(_assessment: Assessment, _actor: string): ActionResult {
  return { ok: true };
}

const POLICY_VERSION = "mvp-allow-all-v1";

function emptyCriterionInput(assessmentId: string, criterionNumber: CriterionNumber): CriterionInput {
  return {
    id: nextId("crit"),
    assessmentId,
    criterionNumber,
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
    status: "Unconfirmed",
    amendmentHistory: [],
    enteredBy: null,
    confirmedBy: null,
    confirmedAt: null,
  };
}

interface CriterionInputValues {
  paidUpCapital?: number | null;
  totalExposure?: number | null;
  currency?: string | null;
  yearRegisteredSg?: number | null;
  litigationRecord?: LitigationRecord | null;
  changeInDirectors?: boolean | null;
  promptPaymentRecord?: PromptPaymentRecord | null;
  evidenceSource?: string | null;
  evidencePeriodOrDate?: string | null;
}

/** Field Review.md §8's per-criterion validation table (FR5.6, FR5.10,
 * FR5.12, FR5.15, FR5.5). Runs on both Confirm and Amend. */
function validateCriterionInput(criterionNumber: CriterionNumber, v: CriterionInputValues, relationshipType: RelationshipType): ActionResult {
  if (criterionNumber === 5) {
    if (v.paidUpCapital === null || v.paidUpCapital === undefined || v.totalExposure === null || v.totalExposure === undefined) {
      return { ok: false, reason: "Paid-up capital and total exposure are both required." };
    }
    if (v.totalExposure <= 0) return { ok: false, reason: "Total exposure must be greater than zero (FR5.15)." };
    return { ok: true };
  }
  if (criterionNumber === 7) {
    if (v.yearRegisteredSg === null || v.yearRegisteredSg === undefined) return { ok: false, reason: "Year registered in Singapore is required." };
    return { ok: true };
  }
  if (criterionNumber === 8) {
    if (!v.litigationRecord) return { ok: false, reason: "A litigation record selection is required." };
    if (!v.evidenceSource?.trim() || !v.evidencePeriodOrDate?.trim()) return { ok: false, reason: "Source searched and date searched are both required to confirm (FR5.10)." };
    return { ok: true };
  }
  if (criterionNumber === 9) {
    if (v.changeInDirectors === null || v.changeInDirectors === undefined) return { ok: false, reason: "A Yes/No selection is required." };
    return { ok: true };
  }
  // criterion 11
  if (relationshipType === "New") return { ok: false, reason: "Criterion 11 is not collected for New customers (FR5.5)." };
  if (!v.promptPaymentRecord) return { ok: false, reason: "A prompt payment record selection is required." };
  if (!v.evidenceSource?.trim() || !v.evidencePeriodOrDate?.trim()) return { ok: false, reason: "System checked and period covered are both required to confirm (FR5.12)." };
  return { ok: true };
}

interface AppState {
  currentUserId: string;
  customers: Customer[];
  documents: AppDocument[];
  assessments: Assessment[];
  extractedFields: ExtractedField[];
  criterionInputs: CriterionInput[];
  integrityChecks: IntegrityCheckResult[];
  ratios: Ratio[];
  ratings: Rating[];
  riskCommentaries: RiskCommentary[];
  approvalDecisions: ApprovalDecision[];
  auditLog: AuditLogEntry[];

  setCurrentUser: (userId: string) => void;
  logAudit: (e: Omit<AuditLogEntry, "id">) => void;

  createCustomer: (name: string, industry: string) => string;
  startAssessment: (customerId: string, division: string) => string;
  overrideRelationshipType: (assessmentId: string, newValue: RelationshipType, reason: string) => ActionResult;

  uploadDocument: (params: {
    assessmentId: string;
    type: DocumentType;
    period?: string;
    financialsDate?: string;
    presentationCurrency?: string;
    presentationScale?: PresentationScale;
    statementBasis?: StatementBasis;
    fileName: string;
  }) => void;

  confirmField: (fieldId: string, value?: number | boolean | null) => void;
  amendField: (fieldId: string, newValue: number | boolean | null, reason: string) => void;
  bulkConfirmHigh: (assessmentId: string) => void;

  confirmCriterionInput: (assessmentId: string, criterionNumber: CriterionNumber, values: CriterionInputValues) => ActionResult;
  amendCriterionInput: (assessmentId: string, criterionNumber: CriterionNumber, values: CriterionInputValues, reason?: string) => ActionResult;

  submitForApproval: (assessmentId: string) => ActionResult;
  approveAssessment: (assessmentId: string, comments: string) => ActionResult;
  rejectAssessment: (assessmentId: string, comments: string) => ActionResult;
  returnAssessment: (assessmentId: string, comments: string) => ActionResult;

  runIntegrityChecksAndRecency: (assessmentId: string) => void;
  checkReviewCompleteAndRecompute: (assessmentId: string) => void;
  recompute: (assessmentId: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  currentUserId: USERS[0].id,
  customers: seedCustomers,
  documents: seedDocuments,
  assessments: seedAssessments,
  extractedFields: seedExtractedFields,
  criterionInputs: seedCriterionInputs,
  integrityChecks: seedIntegrityChecks,
  ratios: seedRatios,
  ratings: seedRatings,
  riskCommentaries: seedRiskCommentaries,
  approvalDecisions: seedApprovalDecisions,
  auditLog: seedAuditLog,

  setCurrentUser: (userId) => set({ currentUserId: userId }),

  logAudit: (e) => set((s) => ({ auditLog: [...s.auditLog, { id: nextId("audit"), ...e }] })),

  createCustomer: (name, industry) => {
    const id = nextId("c");
    set((s) => ({ customers: [...s.customers, { id, name, industry, relationshipOwner: get().currentUserId }] }));
    return id;
  },

  startAssessment: (customerId, division) => {
    const state = get();
    const existing = openAssessmentForPair(state.assessments, customerId, division);
    if (existing) return existing.id;

    const currentUserId = state.currentUserId;
    const id = nextId("a");
    const priorVersions = state.assessments.filter((a) => a.customerId === customerId && a.division === division);
    const relationshipType = deriveRelationshipType(state.assessments, customerId, division);

    const assessment: Assessment = {
      id,
      customerId,
      division,
      version: priorVersions.length + 1,
      state: "Draft",
      relationshipType,
      relationshipTypeOverridden: false,
      relationshipTypeOverrideReason: null,
      assessmentYear: new Date().getFullYear(),
      recencyFlag: null,
      periods: [],
      productType: null,
      contractStartDate: null,
      contractPeriodMonths: null,
      contractValueOrAverageDemand: null,
      principalActivities: null,
      parentageShareholding: null,
      auditedFinancialsFlag: null,
      createdBy: currentUserId,
      createdAt: nowISO(),
      submittedBy: null,
      submittedAt: null,
    };

    const criterionSkeleton: CriterionInput[] = [5, 7, 8, 9, 11].map((n) => emptyCriterionInput(id, n as CriterionNumber));

    set((s) => ({ assessments: [...s.assessments, assessment], criterionInputs: [...s.criterionInputs, ...criterionSkeleton] }));
    get().logAudit({ entityType: "Assessment", entityId: id, actor: currentUserId, action: `New Assessment created (v${assessment.version}, ${relationshipType}, ${division})`, beforeValue: null, afterValue: "Draft", timestamp: nowStamp() });
    return id;
  },

  overrideRelationshipType: (assessmentId, newValue, reason) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return { ok: false, reason: "Assessment not found." };
    if (!reason.trim()) return { ok: false, reason: "A reason is required to override the relationship type (FR5.13)." };
    if (assessment.relationshipType === newValue) return { ok: true };

    set((s) => ({
      assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, relationshipType: newValue, relationshipTypeOverridden: true, relationshipTypeOverrideReason: reason } : a)),
      // FR5.14 — switching to Renewal never inherits a value from before a prior New designation; always starts Unconfirmed on reveal.
      criterionInputs:
        newValue === "Renewal"
          ? s.criterionInputs.map((c) =>
              c.assessmentId === assessmentId && c.criterionNumber === 11
                ? { ...emptyCriterionInput(assessmentId, 11), id: c.id }
                : c,
            )
          : s.criterionInputs,
    }));
    get().logAudit({ entityType: "Assessment", entityId: assessmentId, actor: state.currentUserId, action: `Relationship type overridden to ${newValue} — "${reason}"`, beforeValue: assessment.relationshipType, afterValue: newValue, timestamp: nowStamp() });
    get().checkReviewCompleteAndRecompute(assessmentId);
    return { ok: true };
  },

  uploadDocument: ({ assessmentId, type, period, financialsDate, presentationCurrency, presentationScale, statementBasis, fileName }) => {
    const state = get();
    const currentUserId = state.currentUserId;
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return;

    if (type === "registry") {
      const docId = nextId("doc");
      const doc: AppDocument = {
        id: docId, assessmentId, type, period: null, financialsDate: null, presentationCurrency: null,
        presentationScale: null, statementBasis: null, version: 1, uploader: currentUserId, uploadDate: nowISO(),
        fileName, supersedesDocumentId: null,
      };
      set((s) => ({ documents: [...s.documents, doc] }));
      get().logAudit({ entityType: "Document", entityId: docId, actor: currentUserId, action: "Registry document uploaded", beforeValue: null, afterValue: fileName, timestamp: nowStamp() });

      // FR5.8 tier 1 — ACRA registry governs paid-up capital, but never
      // overwrites an already-Confirmed/Amended criterion 5 row.
      const c5 = state.criterionInputs.find((c) => c.assessmentId === assessmentId && c.criterionNumber === 5);
      if (c5 && c5.status === "Unconfirmed") {
        const prefill = synthesizePaidUpCapital(`${assessmentId}-paidup`);
        set((s) => ({
          criterionInputs: s.criterionInputs.map((c) => (c.id === c5.id ? { ...c, paidUpCapital: prefill, currency: "SGD", source: "registry", sourceDocumentId: docId } : c)),
        }));
        get().logAudit({ entityType: "CriterionInput", entityId: c5.id, actor: "system", action: "Paid-up capital prefilled from ACRA registry (FR5.8)", beforeValue: null, afterValue: String(prefill), timestamp: nowStamp() });
      }
      return;
    }

    if (!period) return; // statement path requires a period
    if (assessment.periods.length >= 2 && !assessment.periods.includes(period)) return; // FR1.3 — exactly two periods

    // FR1.5 — re-uploading a period creates a new version and never
    // overwrites the prior one. The prior document row and its
    // ExtractedField rows are left exactly as they are (not deleted, not
    // mutated); only the new document becomes "live" for that period
    // (selectors.liveDocumentIds/liveExtractedFields), which is what drives
    // review counts and computation back to Unconfirmed on the new rows.
    const priorVersionsForPeriod = state.documents.filter((d) => d.assessmentId === assessmentId && d.type !== "registry" && d.period === period);
    const priorLatest = priorVersionsForPeriod.reduce<AppDocument | null>((max, d) => (!max || d.version > max.version ? d : max), null);

    const docId = nextId("doc");
    const doc: AppDocument = {
      id: docId, assessmentId, type, period, financialsDate: financialsDate ?? nowISO(),
      presentationCurrency: presentationCurrency ?? "SGD", presentationScale: presentationScale ?? "units",
      statementBasis: statementBasis ?? "standalone", version: (priorLatest?.version ?? 0) + 1, uploader: currentUserId, uploadDate: nowISO(),
      fileName, supersedesDocumentId: priorLatest?.id ?? null,
    };

    const financials = synthesizeFinancials(`${assessment.customerId}-${assessment.division}-${period}-v${doc.version}`, hashBias(assessment.customerId));
    const newFields: ExtractedField[] = FIELD_DEFS.map((fdef, i) => ({
      id: nextId("f"),
      assessmentId,
      documentId: docId,
      fieldName: fdef.name,
      section: fdef.section,
      period,
      value: financials[fdef.name],
      originalExtractedValue: financials[fdef.name],
      scaleApplied: doc.presentationScale,
      currency: doc.presentationCurrency,
      confidenceScore: synthesizeConfidence(`${assessment.customerId}-${period}-v${doc.version}-${fdef.name}`),
      sourcePointer: `p.${2 + (i % 6)}, ${fdef.section}, row '${fdef.name}' (${period})`,
      extractionModelVersion: EXTRACTION_MODEL_VERSION,
      status: "Unconfirmed",
      amendmentHistory: [],
    }));

    set((s) => ({
      documents: [...s.documents, doc],
      extractedFields: [...s.extractedFields, ...newFields],
      assessments: s.assessments.map((a) => (a.id === assessmentId && !a.periods.includes(period) ? { ...a, periods: [...a.periods, period].sort() } : a)),
    }));

    get().logAudit({
      entityType: "Document",
      entityId: docId,
      actor: currentUserId,
      action: priorLatest ? `Document uploaded — new version (v${doc.version}, supersedes ${priorLatest.id})` : "Document uploaded",
      beforeValue: priorLatest ? `${priorLatest.fileName} (v${priorLatest.version})` : null,
      afterValue: `${fileName} (${type}, ${period}, v${doc.version})`,
      timestamp: nowStamp(),
    });
    get().runIntegrityChecksAndRecency(assessmentId);
    get().checkReviewCompleteAndRecompute(assessmentId);
  },

  confirmField: (fieldId, value) => {
    const state = get();
    const field = state.extractedFields.find((f) => f.id === fieldId);
    if (!field || field.status !== "Unconfirmed") return;
    const confirmedValue = value === undefined ? field.value : value; // FR3.5 — Confirm with no value asserts genuine absence
    set((s) => ({ extractedFields: s.extractedFields.map((f) => (f.id === fieldId ? { ...f, value: confirmedValue, status: "Confirmed" as FieldStatus } : f)) }));
    get().logAudit({ entityType: "ExtractedField", entityId: fieldId, actor: state.currentUserId, action: `Confirmed: ${field.fieldName} (${field.period})`, beforeValue: "Unconfirmed", afterValue: confirmedValue === null ? "Confirmed absent" : "Confirmed", timestamp: nowStamp() });
    get().checkReviewCompleteAndRecompute(field.assessmentId);
  },

  amendField: (fieldId, newValue, reason) => {
    const state = get();
    const field = state.extractedFields.find((f) => f.id === fieldId);
    if (!field) return;
    const entry: AmendmentHistoryEntry = { previousValue: field.value, previousStatus: field.status, newValue, newStatus: "Amended", reason, actor: state.currentUserId, timestamp: nowStamp() };
    set((s) => ({
      extractedFields: s.extractedFields.map((f) => (f.id === fieldId ? { ...f, value: newValue, status: "Amended" as FieldStatus, amendmentHistory: [...f.amendmentHistory, entry] } : f)),
    }));
    get().logAudit({ entityType: "ExtractedField", entityId: fieldId, actor: state.currentUserId, action: `Amended: ${field.fieldName} (${field.period})`, beforeValue: String(field.value), afterValue: String(newValue), timestamp: nowStamp() });
    get().checkReviewCompleteAndRecompute(field.assessmentId);
  },

  bulkConfirmHigh: (assessmentId) => {
    const state = get();
    const eligible = state.extractedFields.filter((f) => f.assessmentId === assessmentId && f.status === "Unconfirmed" && (f.confidenceScore ?? 0) >= CONFIDENCE_THRESHOLDS.high);
    if (eligible.length === 0) return;
    const eligibleIds = new Set(eligible.map((f) => f.id));
    set((s) => ({ extractedFields: s.extractedFields.map((f) => (eligibleIds.has(f.id) ? { ...f, status: "Confirmed" as FieldStatus } : f)) }));
    get().logAudit({ entityType: "ExtractedField", entityId: assessmentId, actor: state.currentUserId, action: `Bulk-confirmed ${eligible.length} High-confidence field-period items`, beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: nowStamp() });
    get().checkReviewCompleteAndRecompute(assessmentId);
  },

  confirmCriterionInput: (assessmentId, criterionNumber, values) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    const input = state.criterionInputs.find((c) => c.assessmentId === assessmentId && c.criterionNumber === criterionNumber);
    if (!assessment || !input) return { ok: false, reason: "Criterion input not found." };
    if (input.status !== "Unconfirmed") return { ok: false, reason: "Already reviewed — use Amend instead." };
    const validation = validateCriterionInput(criterionNumber, values, assessment.relationshipType);
    if (!validation.ok) return validation;

    set((s) => ({
      criterionInputs: s.criterionInputs.map((c) =>
        c.id === input.id ? { ...c, ...values, status: "Confirmed" as CriterionInputStatus, confirmedBy: state.currentUserId, confirmedAt: nowISO(), source: c.source ?? "manual" } : c,
      ),
    }));
    get().logAudit({ entityType: "CriterionInput", entityId: input.id, actor: state.currentUserId, action: `Criterion ${criterionNumber} confirmed`, beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: nowStamp() });
    get().checkReviewCompleteAndRecompute(assessmentId);
    return { ok: true };
  },

  amendCriterionInput: (assessmentId, criterionNumber, values, reason) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    const input = state.criterionInputs.find((c) => c.assessmentId === assessmentId && c.criterionNumber === criterionNumber);
    if (!assessment || !input) return { ok: false, reason: "Criterion input not found." };
    const validation = validateCriterionInput(criterionNumber, values, assessment.relationshipType);
    if (!validation.ok) return validation;

    const previousSummary = summarizeCriterionInput(input);
    const isCriterion5AmountChange = criterionNumber === 5 && values.totalExposure !== undefined && values.totalExposure !== input.totalExposure;
    const entry: AmendmentHistoryEntry = {
      previousValue: previousSummary,
      previousStatus: input.status,
      newValue: summarizeCriterionInput({ ...input, ...values }),
      newStatus: "Amended",
      reason,
      actor: state.currentUserId,
      timestamp: nowStamp(),
    };

    set((s) => ({
      criterionInputs: s.criterionInputs.map((c) =>
        c.id === input.id
          ? { ...c, ...values, status: "Amended" as CriterionInputStatus, source: criterionNumber === 5 ? "manual" : c.source, amendmentHistory: [...c.amendmentHistory, entry] }
          : c,
      ),
    }));
    get().logAudit({ entityType: "CriterionInput", entityId: input.id, actor: state.currentUserId, action: `Criterion ${criterionNumber} amended${isCriterion5AmountChange ? " — total exposure changed, rescoring (FR5.4)" : ""}`, beforeValue: input.status, afterValue: "Amended", timestamp: nowStamp() });
    get().checkReviewCompleteAndRecompute(assessmentId);
    return { ok: true };
  },

  submitForApproval: (assessmentId) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return { ok: false, reason: "Assessment not found." };
    if (assessment.state !== "Draft") return { ok: false, reason: "Only a Draft assessment can be submitted." };
    const guard = canSubmit(assessment, state.currentUserId);
    if (!guard.ok) return guard;
    const hasRating = state.ratings.some((r) => r.assessmentId === assessmentId);
    if (!hasRating) return { ok: false, reason: "A computed rating is required before submission (FR7.2) — complete every review item first." };

    set((s) => ({ assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, state: "Submitted", submittedBy: state.currentUserId, submittedAt: nowISO() } : a)) }));
    get().logAudit({ entityType: "Assessment", entityId: assessmentId, actor: state.currentUserId, action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: nowStamp() });
    return { ok: true };
  },

  approveAssessment: (assessmentId, comments) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return { ok: false, reason: "Assessment not found." };
    if (assessment.state !== "Submitted") return { ok: false, reason: "Only a Submitted assessment can be decided." };
    const guard = canApprove(assessment, state.currentUserId);
    if (!guard.ok) return guard;
    const decision: ApprovalDecision = { id: nextId("dec"), assessmentId, actor: state.currentUserId, action: "Approve", comments, timestamp: nowISO(), policyVersion: POLICY_VERSION };
    set((s) => ({
      assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, state: "Approved" } : a)),
      approvalDecisions: [...s.approvalDecisions, decision],
    }));
    get().logAudit({ entityType: "Assessment", entityId: assessmentId, actor: state.currentUserId, action: "Approval decision: Approve", beforeValue: "Submitted", afterValue: "Approved", timestamp: nowStamp() });
    return { ok: true };
  },

  rejectAssessment: (assessmentId, comments) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return { ok: false, reason: "Assessment not found." };
    if (assessment.state !== "Submitted") return { ok: false, reason: "Only a Submitted assessment can be decided." };
    const guard = canApprove(assessment, state.currentUserId);
    if (!guard.ok) return guard;
    if (!comments.trim()) return { ok: false, reason: "A reason is required to reject." };
    const decision: ApprovalDecision = { id: nextId("dec"), assessmentId, actor: state.currentUserId, action: "Reject", comments, timestamp: nowISO(), policyVersion: POLICY_VERSION };
    set((s) => ({
      assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, state: "Rejected" } : a)),
      approvalDecisions: [...s.approvalDecisions, decision],
    }));
    get().logAudit({ entityType: "Assessment", entityId: assessmentId, actor: state.currentUserId, action: "Approval decision: Reject", beforeValue: "Submitted", afterValue: "Rejected", timestamp: nowStamp() });
    return { ok: true };
  },

  returnAssessment: (assessmentId, comments) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return { ok: false, reason: "Assessment not found." };
    if (assessment.state !== "Submitted") return { ok: false, reason: "Only a Submitted assessment can be decided." };
    const guard = canReturn(assessment, state.currentUserId);
    if (!guard.ok) return guard;
    if (!comments.trim()) return { ok: false, reason: "Comments are required when returning for revision." };
    const decision: ApprovalDecision = { id: nextId("dec"), assessmentId, actor: state.currentUserId, action: "Return", comments, timestamp: nowISO(), policyVersion: POLICY_VERSION };
    set((s) => ({
      assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, state: "Draft" } : a)),
      approvalDecisions: [...s.approvalDecisions, decision],
    }));
    get().logAudit({ entityType: "Assessment", entityId: assessmentId, actor: state.currentUserId, action: "Approval decision: Return", beforeValue: "Submitted", afterValue: "Draft (returned for revision)", timestamp: nowStamp() });
    return { ok: true };
  },

  // FR3.6/3.7/3.12 — fires right after a period's field skeleton exists, not
  // tied to any confirm action (Field Review.md Flow C/D).
  runIntegrityChecksAndRecency: (assessmentId) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment || assessment.periods.length === 0) return;
    const now = nowISO();
    const fields = liveExtractedFields(state.extractedFields, state.documents, assessmentId);
    const currentPeriod = assessment.periods[assessment.periods.length - 1];
    const priorPeriod = assessment.periods[0];
    const checks = computeIntegrityChecks(assessmentId, fields, assessment.periods, currentPeriod, priorPeriod, now);

    // FR1.5 — the live (highest-version) document for the current period, not just the first upload.
    const latestDoc = state.documents
      .filter((d) => d.assessmentId === assessmentId && d.period === currentPeriod)
      .reduce<AppDocument | null>((max, d) => (!max || d.version > max.version ? d : max), null);
    let recencyFlag: Assessment["recencyFlag"] = assessment.recencyFlag;
    if (latestDoc?.financialsDate) {
      const daysSince = (Date.now() - new Date(latestDoc.financialsDate).getTime()) / (1000 * 60 * 60 * 24);
      recencyFlag = daysSince > RECENCY_THRESHOLD_DAYS ? "Non-Recent" : "Recent";
    }

    set((s) => ({
      integrityChecks: [...s.integrityChecks.filter((c) => c.assessmentId !== assessmentId), ...checks],
      assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, recencyFlag } : a)),
    }));
  },

  // FR3.8 — the hard gate. Never computes on partial data; recomputes on
  // every subsequent amendment once the gate first holds (FR4.8).
  checkReviewCompleteAndRecompute: (assessmentId) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return;
    if (!reviewComplete(liveExtractedFields(state.extractedFields, state.documents, assessmentId), state.criterionInputs, assessment)) return;
    get().recompute(assessmentId);
  },

  recompute: (assessmentId) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment || assessment.periods.length < 2) return;
    const now = nowISO();
    const currentPeriod = assessment.periods[assessment.periods.length - 1];
    const priorPeriod = assessment.periods[0];

    const fields = liveExtractedFields(state.extractedFields, state.documents, assessmentId).filter((f) => f.status !== "Unconfirmed");
    const criterionInputs = state.criterionInputs.filter((c) => c.assessmentId === assessmentId && c.status !== "Unconfirmed");

    const newRatios = computeRatios(assessmentId, fields, criterionInputs, currentPeriod, priorPeriod, assessment.assessmentYear, now);
    const rating = computeRating(assessmentId, newRatios, criterionInputs, fields, currentPeriod, assessment.relationshipType, now);

    const priorLiveCommentary = state.riskCommentaries.find((c) => c.assessmentId === assessmentId && c.supersededAt === null);
    const commentary = generateRiskCommentary(assessmentId, rating.id, rating, newRatios, fields, criterionInputs, currentPeriod, priorPeriod, now);

    set((s) => ({
      ratios: [...s.ratios.filter((r) => r.assessmentId !== assessmentId), ...newRatios],
      ratings: [...s.ratings.filter((r) => r.assessmentId !== assessmentId), rating],
      riskCommentaries: [
        ...s.riskCommentaries.map((c) => (c.id === priorLiveCommentary?.id ? { ...c, supersededAt: now } : c)),
        commentary,
      ],
    }));
  },
}));

function summarizeCriterionInput(c: CriterionInput): string {
  switch (c.criterionNumber) {
    case 5:
      return `paidUpCapital=${c.paidUpCapital ?? "—"}, totalExposure=${c.totalExposure ?? "—"}`;
    case 7:
      return `yearRegisteredSg=${c.yearRegisteredSg ?? "—"}`;
    case 8:
      return `litigationRecord=${c.litigationRecord ?? "—"}`;
    case 9:
      return `changeInDirectors=${c.changeInDirectors ?? "—"}`;
    case 11:
      return `promptPaymentRecord=${c.promptPaymentRecord ?? "—"}`;
  }
}

function hashBias(customerId: string): number {
  let h = 0;
  for (let i = 0; i < customerId.length; i++) h = (h * 31 + customerId.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * 0.6 - 0.2;
}

export function useCurrentUser() {
  return useStore((s) => USERS.find((u) => u.id === s.currentUserId)!);
}
