import { create } from "zustand";
import type {
  AppDocument,
  ApprovalDecision,
  Assessment,
  AuditLogEntry,
  CriterionInput,
  CriterionNumber,
  Customer,
  DocumentType,
  ExtractedField,
  IntegrityCheckResult,
  LitigationRecord,
  PresentationScale,
  PromptPaymentRecord,
  Rating,
  RelationshipType,
  RiskCommentary,
  Ratio,
  StatementBasis,
} from "../types.js";
import { USERS } from "../data/seed.js";
import { api, ApiError } from "../api/client.js";

interface ActionResult {
  ok: boolean;
  reason?: string;
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

interface AssessmentDetail {
  assessment: Assessment;
  documents: AppDocument[];
  extractedFields: ExtractedField[];
  criterionInputs: CriterionInput[];
  integrityChecks: IntegrityCheckResult[];
  ratios: Ratio[];
  rating: Rating | null;
  riskCommentary: RiskCommentary | null;
  approvalDecisions: ApprovalDecision[];
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

  loadBootstrap: () => Promise<void>;
  loadAssessmentDetail: (assessmentId: string) => Promise<void>;

  createCustomer: (name: string, industry: string) => Promise<string>;
  startAssessment: (customerId: string, division: string) => Promise<string>;
  overrideRelationshipType: (assessmentId: string, newValue: RelationshipType, reason: string) => Promise<ActionResult>;

  uploadDocument: (params: {
    assessmentId: string;
    type: DocumentType;
    file: File;
    period?: string;
    financialsDate?: string;
    presentationCurrency?: string;
    presentationScale?: PresentationScale;
    statementBasis?: StatementBasis;
  }) => Promise<ActionResult>;

  confirmField: (fieldId: string, value?: number | boolean | null) => Promise<void>;
  amendField: (fieldId: string, newValue: number | boolean | null, reason: string) => Promise<void>;
  bulkConfirmHigh: (assessmentId: string) => Promise<void>;

  confirmCriterionInput: (assessmentId: string, criterionNumber: CriterionNumber, values: CriterionInputValues) => Promise<ActionResult>;
  amendCriterionInput: (assessmentId: string, criterionNumber: CriterionNumber, values: CriterionInputValues, reason?: string) => Promise<ActionResult>;

  submitForApproval: (assessmentId: string) => Promise<ActionResult>;
  approveAssessment: (assessmentId: string, comments: string) => Promise<ActionResult>;
  rejectAssessment: (assessmentId: string, comments: string) => Promise<ActionResult>;
  returnAssessment: (assessmentId: string, comments: string) => Promise<ActionResult>;
}

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const idx = list.findIndex((x) => x.id === row.id);
  if (idx === -1) return [...list, row];
  const next = [...list];
  next[idx] = row;
  return next;
}

function toActionResult(err: unknown, fallback: string): ActionResult {
  if (err instanceof ApiError) return { ok: false, reason: err.message };
  return { ok: false, reason: fallback };
}

export const useStore = create<AppState>((set, get) => ({
  currentUserId: USERS[0].id,
  customers: [],
  documents: [],
  assessments: [],
  extractedFields: [],
  criterionInputs: [],
  integrityChecks: [],
  ratios: [],
  ratings: [],
  riskCommentaries: [],
  approvalDecisions: [],
  auditLog: [],

  setCurrentUser: (userId) => set({ currentUserId: userId }),

  loadBootstrap: async () => {
    const data = (await api.bootstrap()) as {
      customers: Customer[];
      assessments: Assessment[];
      ratings: Rating[];
      documents: AppDocument[];
      approvalDecisions: ApprovalDecision[];
      auditLog: AuditLogEntry[];
    };
    set({
      customers: data.customers,
      assessments: data.assessments,
      ratings: data.ratings,
      documents: data.documents,
      approvalDecisions: data.approvalDecisions,
      auditLog: data.auditLog,
    });
  },

  loadAssessmentDetail: async (assessmentId) => {
    const detail = (await api.getAssessment(assessmentId)) as AssessmentDetail;
    set((s) => ({
      assessments: upsert(s.assessments, detail.assessment),
      documents: [...s.documents.filter((d) => d.assessmentId !== assessmentId), ...detail.documents],
      extractedFields: [...s.extractedFields.filter((f) => f.assessmentId !== assessmentId), ...detail.extractedFields],
      criterionInputs: [...s.criterionInputs.filter((c) => c.assessmentId !== assessmentId), ...detail.criterionInputs],
      integrityChecks: [...s.integrityChecks.filter((c) => c.assessmentId !== assessmentId), ...detail.integrityChecks],
      ratios: [...s.ratios.filter((r) => r.assessmentId !== assessmentId), ...detail.ratios],
      ratings: detail.rating ? upsert(s.ratings, detail.rating) : s.ratings.filter((r) => r.assessmentId !== assessmentId),
      riskCommentaries: [
        ...s.riskCommentaries.filter((c) => c.assessmentId !== assessmentId),
        ...(detail.riskCommentary ? [detail.riskCommentary] : []),
      ],
      approvalDecisions: [...s.approvalDecisions.filter((d) => d.assessmentId !== assessmentId), ...detail.approvalDecisions],
    }));
  },

  createCustomer: async (name, industry) => {
    const customer = (await api.createCustomer(name, industry, get().currentUserId)) as Customer;
    set((s) => ({ customers: [...s.customers, customer] }));
    return customer.id;
  },

  startAssessment: async (customerId, division) => {
    const assessment = (await api.startAssessment(customerId, division, get().currentUserId)) as Assessment;
    set((s) => ({ assessments: upsert(s.assessments, assessment) }));
    return assessment.id;
  },

  overrideRelationshipType: async (assessmentId, newValue, reason) => {
    try {
      const assessment = (await api.overrideRelationshipType(assessmentId, newValue, reason, get().currentUserId)) as Assessment;
      set((s) => ({ assessments: upsert(s.assessments, assessment) }));
      await get().loadAssessmentDetail(assessmentId);
      return { ok: true };
    } catch (err) {
      return toActionResult(err, "Could not override relationship type.");
    }
  },

  uploadDocument: async ({ assessmentId, type, file, period, financialsDate, presentationCurrency, presentationScale, statementBasis }) => {
    try {
      const form = new FormData();
      form.set("type", type);
      form.set("file", file);
      if (period) form.set("period", period);
      if (financialsDate) form.set("financialsDate", financialsDate);
      if (presentationCurrency) form.set("presentationCurrency", presentationCurrency);
      if (presentationScale) form.set("presentationScale", presentationScale);
      if (statementBasis) form.set("statementBasis", statementBasis);

      await api.uploadDocument(assessmentId, form, get().currentUserId);
      await get().loadAssessmentDetail(assessmentId);
      return { ok: true };
    } catch (err) {
      return toActionResult(err, "Upload failed.");
    }
  },

  confirmField: async (fieldId, value) => {
    const field = get().extractedFields.find((f) => f.id === fieldId);
    if (!field) return;
    await api.confirmField(fieldId, value, get().currentUserId);
    await get().loadAssessmentDetail(field.assessmentId);
  },

  amendField: async (fieldId, newValue, reason) => {
    const field = get().extractedFields.find((f) => f.id === fieldId);
    if (!field) return;
    await api.amendField(fieldId, newValue, reason, get().currentUserId);
    await get().loadAssessmentDetail(field.assessmentId);
  },

  bulkConfirmHigh: async (assessmentId) => {
    await api.bulkConfirmHigh(assessmentId, get().currentUserId);
    await get().loadAssessmentDetail(assessmentId);
  },

  confirmCriterionInput: async (assessmentId, criterionNumber, values) => {
    try {
      const result = await api.confirmCriterion(assessmentId, criterionNumber, values, get().currentUserId);
      if (result.ok) await get().loadAssessmentDetail(assessmentId);
      return result;
    } catch (err) {
      return toActionResult(err, "Could not save.");
    }
  },

  amendCriterionInput: async (assessmentId, criterionNumber, values, reason) => {
    try {
      const result = await api.amendCriterion(assessmentId, criterionNumber, values, reason, get().currentUserId);
      if (result.ok) await get().loadAssessmentDetail(assessmentId);
      return result;
    } catch (err) {
      return toActionResult(err, "Could not save.");
    }
  },

  submitForApproval: async (assessmentId) => {
    try {
      const result = await api.submitAssessment(assessmentId, get().currentUserId);
      if (result.ok) await get().loadAssessmentDetail(assessmentId);
      return result;
    } catch (err) {
      return toActionResult(err, "Could not submit.");
    }
  },

  approveAssessment: async (assessmentId, comments) => {
    try {
      const result = await api.decideAssessment(assessmentId, "Approve", comments, get().currentUserId);
      if (result.ok) await get().loadAssessmentDetail(assessmentId);
      return result;
    } catch (err) {
      return toActionResult(err, "Could not approve.");
    }
  },

  rejectAssessment: async (assessmentId, comments) => {
    try {
      const result = await api.decideAssessment(assessmentId, "Reject", comments, get().currentUserId);
      if (result.ok) await get().loadAssessmentDetail(assessmentId);
      return result;
    } catch (err) {
      return toActionResult(err, "Could not reject.");
    }
  },

  returnAssessment: async (assessmentId, comments) => {
    try {
      const result = await api.decideAssessment(assessmentId, "Return", comments, get().currentUserId);
      if (result.ok) await get().loadAssessmentDetail(assessmentId);
      return result;
    } catch (err) {
      return toActionResult(err, "Could not return.");
    }
  },
}));

export function useCurrentUser() {
  return useStore((s) => USERS.find((u) => u.id === s.currentUserId)!);
}
