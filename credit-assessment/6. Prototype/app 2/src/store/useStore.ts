import { create } from "zustand";
import type {
  AppDocument,
  ApprovalDecision,
  Assessment,
  AuditLogEntry,
  Customer,
  ExtractedField,
  FieldStatus,
  Rating,
  Ratio,
  Recommendation,
  ScorecardConfig,
} from "../types";
import {
  DEFAULT_USER_ID,
  USERS,
  approvalDecisions as seedApprovalDecisions,
  assessments as seedAssessments,
  auditLog as seedAuditLog,
  customers as seedCustomers,
  documents as seedDocuments,
  extractedFields as seedExtractedFields,
  ratings as seedRatings,
  ratios as seedRatios,
  recommendations as seedRecommendations,
} from "../data/seed";
import { PLACEHOLDER_CONFIG, STANDARD_FIELDS } from "../data/config";
import { synthesizeConfidence, synthesizeFinancials } from "../data/synthesize";
import { computeAllRatios } from "../engine/ratios";
import { computeRating } from "../engine/rating";
import { computeRecommendation } from "../engine/recommendation";
import { hasProvisionalRatio } from "./selectors";

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}-${idCounter++}`;
const nowISO = () => new Date().toISOString().slice(0, 10);

interface SubmitResult {
  ok: boolean;
  reason?: string;
}

interface AppState {
  currentUserId: string;
  config: ScorecardConfig;
  customers: Customer[];
  documents: AppDocument[];
  assessments: Assessment[];
  extractedFields: ExtractedField[];
  ratios: Ratio[];
  ratings: Rating[];
  recommendations: Recommendation[];
  approvalDecisions: ApprovalDecision[];
  auditLog: AuditLogEntry[];

  setCurrentUser: (userId: string) => void;
  logAudit: (e: Omit<AuditLogEntry, "id">) => void;

  createNewAssessment: (customerId: string) => string;
  createRefreshAssessment: (customerId: string, sourceAssessmentId: string) => string;
  createCustomer: (name: string, industry: string) => string;

  uploadDocument: (params: {
    customerId: string;
    assessmentId: string;
    period: string;
    type: "audited" | "unaudited";
    fileName: string;
  }) => void;

  confirmField: (fieldId: string) => void;
  amendField: (fieldId: string, newValue: number, reason: string) => void;
  markNotPresent: (fieldId: string) => void;
  bulkConfirmHigh: (assessmentId: string) => void;

  overrideRecommendation: (assessmentId: string, limit: number, termsDays: number, justification: string) => void;

  submitForApproval: (assessmentId: string) => SubmitResult;
  approveAssessment: (assessmentId: string, comments: string) => SubmitResult;
  rejectAssessment: (assessmentId: string, comments: string) => SubmitResult;
  returnAssessment: (assessmentId: string, comments: string) => SubmitResult;

  recompute: (assessmentId: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  currentUserId: DEFAULT_USER_ID,
  config: PLACEHOLDER_CONFIG,
  customers: seedCustomers,
  documents: seedDocuments,
  assessments: seedAssessments,
  extractedFields: seedExtractedFields,
  ratios: seedRatios,
  ratings: seedRatings,
  recommendations: seedRecommendations,
  approvalDecisions: seedApprovalDecisions,
  auditLog: seedAuditLog,

  setCurrentUser: (userId) => set({ currentUserId: userId }),

  logAudit: (e) => set((s) => ({ auditLog: [...s.auditLog, { id: nextId("audit"), ...e }] })),

  createCustomer: (name, industry) => {
    const id = nextId("c");
    const currentUserId = get().currentUserId;
    set((s) => ({ customers: [...s.customers, { id, name, industry, relationshipOwner: currentUserId }] }));
    return id;
  },

  createNewAssessment: (customerId) => {
    const id = nextId("a");
    const currentUserId = get().currentUserId;
    const assessment: Assessment = {
      id,
      customerId,
      version: 1,
      state: "Draft",
      periods: [],
      createdBy: currentUserId,
      createdAt: nowISO(),
      sourceAssessmentId: null,
    };
    set((s) => ({ assessments: [...s.assessments, assessment] }));
    get().logAudit({ entityType: "Assessment", entityId: id, actor: currentUserId, action: "New Assessment created (v1)", beforeValue: null, afterValue: "Draft", timestamp: nowISO() });
    return id;
  },

  createRefreshAssessment: (customerId, sourceAssessmentId) => {
    const state = get();
    const source = state.assessments.find((a) => a.id === sourceAssessmentId);
    if (!source) throw new Error("Refresh source not found");
    const currentUserId = state.currentUserId;
    const id = nextId("a");
    const assessment: Assessment = {
      id,
      customerId,
      version: source.version + 1,
      state: "Draft",
      periods: [...source.periods],
      createdBy: currentUserId,
      createdAt: nowISO(),
      sourceAssessmentId: source.id,
    };

    // FR1.7 copy-on-reuse: copy the source assessment's most recent extraction
    // for each already-covered period into this assessment's own scope, reset
    // to Unconfirmed. document_id stays as provenance; assessment_id changes.
    const copiedFields: ExtractedField[] = state.extractedFields
      .filter((f) => f.assessmentId === source.id)
      .map((f) => ({
        ...f,
        id: nextId("f"),
        assessmentId: id,
        status: "Unconfirmed" as FieldStatus,
        amendmentHistory: [],
      }));

    const docsToLink = state.documents.filter((d) => source.periods.includes(d.period ?? "") && d.referencedByAssessmentIds.includes(source.id));

    set((s) => ({
      assessments: [...s.assessments, assessment],
      extractedFields: [...s.extractedFields, ...copiedFields],
      documents: s.documents.map((d) => (docsToLink.some((x) => x.id === d.id) ? { ...d, referencedByAssessmentIds: [...d.referencedByAssessmentIds, id] } : d)),
    }));

    get().logAudit({ entityType: "Assessment", entityId: id, actor: currentUserId, action: `Refresh Assessment created (v${assessment.version}, source v${source.version})`, beforeValue: null, afterValue: "Draft", timestamp: nowISO() });
    get().logAudit({ entityType: "ExtractedField", entityId: id, actor: "system", action: `${copiedFields.length} fields copied from v${source.version} (FR1.7), reset to Unconfirmed`, beforeValue: null, afterValue: "Unconfirmed", timestamp: nowISO() });
    if (source.periods.length > 0) get().recompute(id);
    return id;
  },

  uploadDocument: ({ customerId, assessmentId, period, type, fileName }) => {
    const state = get();
    const currentUserId = state.currentUserId;
    const docId = nextId("doc");
    const doc: AppDocument = {
      id: docId,
      customerId,
      type,
      period,
      currency: "USD",
      version: 1,
      uploader: currentUserId,
      uploadDate: nowISO(),
      fileName,
      referencedByAssessmentIds: [assessmentId],
    };

    // Mock FR2 extraction: synthesize a field set, seeded on customer+period so
    // re-visiting the same upload in this session stays stable.
    const financials = synthesizeFinancials(`${customerId}-${period}`, hashBias(customerId));
    const newFields: ExtractedField[] = STANDARD_FIELDS.map((fdef, i) => ({
      id: nextId("f"),
      assessmentId,
      documentId: docId,
      fieldName: fdef.name,
      section: fdef.section,
      period,
      value: financials[fdef.name],
      originalExtractedValue: financials[fdef.name],
      unit: "currency",
      currency: "USD",
      confidenceScore: synthesizeConfidence(`${customerId}-${period}-${fdef.name}`),
      sourcePointer: `p.${2 + (i % 6)}, ${fdef.section}, row '${fdef.name}' (${period})`,
      extractionModelVersion: "extract-v1.4.2",
      status: "Unconfirmed",
      amendmentHistory: [],
    }));

    set((s) => ({
      documents: [...s.documents, doc],
      extractedFields: [...s.extractedFields, ...newFields],
      assessments: s.assessments.map((a) => (a.id === assessmentId && !a.periods.includes(period) ? { ...a, periods: [...a.periods, period].sort() } : a)),
    }));

    get().logAudit({ entityType: "Document", entityId: docId, actor: currentUserId, action: "Document uploaded", beforeValue: null, afterValue: `${fileName} (${type}, ${period})`, timestamp: nowISO() });
    get().recompute(assessmentId);
  },

  confirmField: (fieldId) => {
    const state = get();
    const field = state.extractedFields.find((f) => f.id === fieldId);
    if (!field || field.status !== "Unconfirmed") return;
    set((s) => ({ extractedFields: s.extractedFields.map((f) => (f.id === fieldId ? { ...f, status: "Confirmed" } : f)) }));
    get().logAudit({ entityType: "ExtractedField", entityId: fieldId, actor: state.currentUserId, action: `Confirmed: ${field.fieldName} (${field.period})`, beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: nowISO() });
    get().recompute(field.assessmentId);
  },

  amendField: (fieldId, newValue, reason) => {
    const state = get();
    const field = state.extractedFields.find((f) => f.id === fieldId);
    if (!field) return;
    const entry = { previousValue: field.value, previousStatus: field.status, newValue, newStatus: "Amended" as FieldStatus, reason, actor: state.currentUserId, timestamp: nowISO() };
    set((s) => ({
      extractedFields: s.extractedFields.map((f) => (f.id === fieldId ? { ...f, value: newValue, status: "Amended", amendmentHistory: [...f.amendmentHistory, entry] } : f)),
    }));
    get().logAudit({ entityType: "ExtractedField", entityId: fieldId, actor: state.currentUserId, action: `Amended: ${field.fieldName} (${field.period})`, beforeValue: String(field.value), afterValue: String(newValue), timestamp: nowISO() });
    get().recompute(field.assessmentId);
  },

  markNotPresent: (fieldId) => {
    const state = get();
    const field = state.extractedFields.find((f) => f.id === fieldId);
    if (!field) return;
    const entry = { previousValue: field.value, previousStatus: field.status, newValue: null, newStatus: "Not Present" as FieldStatus, actor: state.currentUserId, timestamp: nowISO() };
    set((s) => ({
      extractedFields: s.extractedFields.map((f) => (f.id === fieldId ? { ...f, value: null, status: "Not Present", amendmentHistory: [...f.amendmentHistory, entry] } : f)),
    }));
    get().logAudit({ entityType: "ExtractedField", entityId: fieldId, actor: state.currentUserId, action: `Marked Not Present: ${field.fieldName} (${field.period})`, beforeValue: field.status, afterValue: "Not Present", timestamp: nowISO() });
    get().recompute(field.assessmentId);
  },

  bulkConfirmHigh: (assessmentId) => {
    const state = get();
    const threshold = state.config.confidenceThresholds.high;
    const eligible = state.extractedFields.filter((f) => f.assessmentId === assessmentId && f.status === "Unconfirmed" && (f.confidenceScore ?? 0) >= threshold);
    if (eligible.length === 0) return;
    const eligibleIds = new Set(eligible.map((f) => f.id));
    set((s) => ({ extractedFields: s.extractedFields.map((f) => (eligibleIds.has(f.id) ? { ...f, status: "Confirmed" } : f)) }));
    get().logAudit({ entityType: "ExtractedField", entityId: assessmentId, actor: state.currentUserId, action: `Bulk-confirmed ${eligible.length} High-confidence field-period items`, beforeValue: "Unconfirmed", afterValue: "Confirmed", timestamp: nowISO() });
    get().recompute(assessmentId);
  },

  overrideRecommendation: (assessmentId, limit, termsDays, justification) => {
    const state = get();
    const rec = state.recommendations.find((r) => r.assessmentId === assessmentId);
    if (!rec) return;
    set((s) => ({
      recommendations: s.recommendations.map((r) => (r.assessmentId === assessmentId ? { ...r, proposedLimit: limit, proposedTermsDays: termsDays, overrideFlag: true, overrideJustification: justification } : r)),
    }));
    get().logAudit({ entityType: "Recommendation", entityId: rec.id, actor: state.currentUserId, action: "Recommendation overridden", beforeValue: `${rec.systemProposedLimit} / ${rec.systemProposedTermsDays}d`, afterValue: `${limit} / ${termsDays}d — ${justification}`, timestamp: nowISO() });
  },

  submitForApproval: (assessmentId) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return { ok: false, reason: "Assessment not found." };
    if (assessment.state !== "Draft") return { ok: false, reason: "Only a Draft assessment can be submitted." };
    if (assessment.periods.length === 0) return { ok: false, reason: "Upload at least one period's statement before submitting." };
    if (hasProvisionalRatio(state.ratios, assessmentId)) {
      return { ok: false, reason: "FR3.10: submission is blocked while any ratio remains Provisional. Confirm, amend, or mark Not Present on every outstanding field." };
    }
    set((s) => ({ assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, state: "Submitted" } : a)) }));
    get().logAudit({ entityType: "Assessment", entityId: assessmentId, actor: state.currentUserId, action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted", timestamp: nowISO() });
    return { ok: true };
  },

  approveAssessment: (assessmentId, comments) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return { ok: false, reason: "Assessment not found." };
    if (assessment.state !== "Submitted") return { ok: false, reason: "Only a Submitted assessment can be decided." };
    if (assessment.createdBy === state.currentUserId) {
      return { ok: false, reason: "FR7.5: segregation of duties — you cannot approve an assessment you prepared." };
    }
    const decision: ApprovalDecision = { id: nextId("dec"), assessmentId, actor: state.currentUserId, action: "Approve", comments, timestamp: nowISO() };
    set((s) => ({
      assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, state: "Approved" } : a)),
      approvalDecisions: [...s.approvalDecisions, decision],
      recommendations: s.recommendations.map((r) => (r.assessmentId === assessmentId ? { ...r, effectiveDate: nowISO() } : r)),
    }));
    get().logAudit({ entityType: "Assessment", entityId: assessmentId, actor: state.currentUserId, action: "Approval decision: Approve", beforeValue: "Submitted", afterValue: "Approved", timestamp: nowISO() });
    return { ok: true };
  },

  rejectAssessment: (assessmentId, comments) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return { ok: false, reason: "Assessment not found." };
    if (assessment.state !== "Submitted") return { ok: false, reason: "Only a Submitted assessment can be decided." };
    if (assessment.createdBy === state.currentUserId) {
      return { ok: false, reason: "FR7.5: segregation of duties — you cannot decide an assessment you prepared." };
    }
    if (!comments.trim()) return { ok: false, reason: "A reason is required to reject." };
    const decision: ApprovalDecision = { id: nextId("dec"), assessmentId, actor: state.currentUserId, action: "Reject", comments, timestamp: nowISO() };
    set((s) => ({
      assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, state: "Rejected" } : a)),
      approvalDecisions: [...s.approvalDecisions, decision],
    }));
    get().logAudit({ entityType: "Assessment", entityId: assessmentId, actor: state.currentUserId, action: "Approval decision: Reject", beforeValue: "Submitted", afterValue: "Rejected", timestamp: nowISO() });
    return { ok: true };
  },

  returnAssessment: (assessmentId, comments) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return { ok: false, reason: "Assessment not found." };
    if (assessment.state !== "Submitted") return { ok: false, reason: "Only a Submitted assessment can be decided." };
    if (assessment.createdBy === state.currentUserId) {
      return { ok: false, reason: "FR7.5: segregation of duties — you cannot decide an assessment you prepared." };
    }
    if (!comments.trim()) return { ok: false, reason: "Comments are required when returning for revision." };
    const decision: ApprovalDecision = { id: nextId("dec"), assessmentId, actor: state.currentUserId, action: "Return", comments, timestamp: nowISO() };
    set((s) => ({
      assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, state: "Draft" } : a)),
      approvalDecisions: [...s.approvalDecisions, decision],
    }));
    get().logAudit({ entityType: "Assessment", entityId: assessmentId, actor: state.currentUserId, action: "Approval decision: Return", beforeValue: "Submitted", afterValue: "Draft (returned for revision)", timestamp: nowISO() });
    return { ok: true };
  },

  recompute: (assessmentId) => {
    const state = get();
    const assessment = state.assessments.find((a) => a.id === assessmentId);
    if (!assessment || assessment.periods.length === 0) return;
    const now = nowISO();
    const newRatios = computeAllRatios(assessmentId, assessment.periods, state.extractedFields, state.config, now);
    const mostRecentPeriod = assessment.periods[assessment.periods.length - 1];
    const ratiosForMostRecent = newRatios.filter((r) => r.period === mostRecentPeriod);
    const rating = computeRating(assessmentId, ratiosForMostRecent, mostRecentPeriod, state.config, now);
    const revenueField = state.extractedFields.find((f) => f.assessmentId === assessmentId && f.fieldName === "Revenue" && f.period === mostRecentPeriod);
    const rec = computeRecommendation(assessmentId, rating, revenueField?.value ?? 0, "USD", state.config);

    set((s) => ({
      ratios: [...s.ratios.filter((r) => r.assessmentId !== assessmentId), ...newRatios],
      ratings: [...s.ratings.filter((r) => r.assessmentId !== assessmentId), rating],
      recommendations: rec
        ? [...s.recommendations.filter((r) => r.assessmentId !== assessmentId), rec]
        : s.recommendations.filter((r) => r.assessmentId !== assessmentId),
    }));
  },
}));

function hashBias(customerId: string): number {
  // Stable per-customer "quality" so a customer's numbers don't whiplash
  // across periods within this session's live uploads.
  let h = 0;
  for (let i = 0; i < customerId.length; i++) h = (h * 31 + customerId.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * 0.6 - 0.2; // roughly [-0.2, 0.4]
}

/** Reactive — subscribes to currentUserId so role-switcher changes re-render
 * every page that calls this, not just ones that happen to re-render for
 * another reason. */
export function useCurrentUser() {
  return useStore((s) => USERS.find((u) => u.id === s.currentUserId)!);
}
