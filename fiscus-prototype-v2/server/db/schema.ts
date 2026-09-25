// Drizzle schema — mirrors src/types.ts (PRD Credit_Assessment_PRD_MVP.md §4).
// One table per PRD §4 entity. jsonb is used for nested/union shapes that
// types.ts models as arrays or `number | boolean | null` unions, so the
// server never has to guess a column's shape from a discriminant.

import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import type { AmendmentHistoryEntry, CriterionDriver, OperandMovement, RiskObservation } from "../../src/types.js";

export const assessmentStateEnum = pgEnum("assessment_state", ["Draft", "Submitted", "Approved", "Rejected"]);
export const relationshipTypeEnum = pgEnum("relationship_type", ["New", "Renewal"]);
export const recencyFlagEnum = pgEnum("recency_flag", ["Recent", "Non-Recent"]);
export const fieldStatusEnum = pgEnum("field_status", ["Unconfirmed", "Confirmed", "Amended"]);
export const documentTypeEnum = pgEnum("document_type", ["audited", "unaudited", "registry"]);
export const statementBasisEnum = pgEnum("statement_basis", ["standalone", "consolidated"]);
export const presentationScaleEnum = pgEnum("presentation_scale", ["units", "thousands", "millions"]);
export const paidUpCapitalSourceEnum = pgEnum("paid_up_capital_source", ["registry", "statement-note", "manual"]);
export const litigationRecordEnum = pgEnum("litigation_record", ["Clean", "Motor suits only", "Other record"]);
export const promptPaymentRecordEnum = pgEnum("prompt_payment_record", ["Good", "Late", "None held"]);
export const ratingClassEnum = pgEnum("rating_class", ["A", "B", "C"]);
export const weightSetEnum = pgEnum("weight_set", ["new", "renewal"]);
export const approvalActionEnum = pgEnum("approval_action", ["Approve", "Reject", "Return"]);
// UI-only status feed for the app's two real model surfaces — not a PRD
// entity, not read by any scoring/compliance logic, purely so the workspace
// can show "Extraction: running" / "Risk Commentary: done" while a request
// is in flight. agentType is fixed to exactly these two per the MVP's "two
// model surfaces" constraint (Credit_Assessment_PRD_MVP.md).
export const agentTypeEnum = pgEnum("agent_type", ["extraction", "risk_commentary"]);
export const agentStatusEnum = pgEnum("agent_status", ["idle", "running", "done", "failed"]);

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  relationshipOwner: text("relationship_owner").notNull(),
});

export const assessments = pgTable("assessments", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  division: text("division").notNull(),
  version: integer("version").notNull(),
  state: assessmentStateEnum("state").notNull(),
  relationshipType: relationshipTypeEnum("relationship_type").notNull(),
  relationshipTypeOverridden: boolean("relationship_type_overridden").notNull().default(false),
  relationshipTypeOverrideReason: text("relationship_type_override_reason"),
  assessmentYear: integer("assessment_year").notNull(),
  recencyFlag: recencyFlagEnum("recency_flag"),
  periods: jsonb("periods").$type<string[]>().notNull().default([]),
  productType: text("product_type"),
  contractStartDate: text("contract_start_date"),
  contractPeriodMonths: integer("contract_period_months"),
  contractValueOrAverageDemand: doublePrecision("contract_value_or_average_demand"),
  principalActivities: text("principal_activities"),
  parentageShareholding: text("parentage_shareholding"),
  auditedFinancialsFlag: boolean("audited_financials_flag"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  submittedBy: text("submitted_by"),
  submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
});

// FR8.3 — at most one non-terminal (Draft|Submitted) assessment per
// (customer, division); enforced in the API layer (state is part of the
// predicate, which a plain unique index can't express) — see routes/assessments.ts.

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id),
  type: documentTypeEnum("type").notNull(),
  period: text("period"),
  financialsDate: text("financials_date"),
  presentationCurrency: text("presentation_currency"),
  presentationScale: presentationScaleEnum("presentation_scale"),
  statementBasis: statementBasisEnum("statement_basis"),
  version: integer("version").notNull().default(1),
  uploader: text("uploader").notNull(),
  uploadDate: timestamp("upload_date", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  fileName: text("file_name").notNull(),
  blobUrl: text("blob_url").notNull(),
  supersedesDocumentId: text("supersedes_document_id"),
});

export const extractedFields = pgTable("extracted_fields", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id),
  documentId: text("document_id").notNull().references(() => documents.id),
  fieldName: text("field_name").notNull(),
  section: text("section").notNull(),
  period: text("period").notNull(),
  value: jsonb("value").$type<number | boolean | null>(),
  originalExtractedValue: jsonb("original_extracted_value").$type<number | boolean | null>(),
  scaleApplied: presentationScaleEnum("scale_applied"),
  currency: text("currency"),
  confidenceScore: doublePrecision("confidence_score"),
  sourcePointer: text("source_pointer"),
  extractionModelVersion: text("extraction_model_version"),
  status: fieldStatusEnum("status").notNull().default("Unconfirmed"),
  amendmentHistory: jsonb("amendment_history").$type<AmendmentHistoryEntry[]>().notNull().default([]),
});

export const integrityCheckResults = pgTable("integrity_check_results", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id),
  checkName: text("check_name").notNull(),
  period: text("period").notNull(),
  operandFieldIds: jsonb("operand_field_ids").$type<string[]>().notNull().default([]),
  expected: doublePrecision("expected"),
  actual: doublePrecision("actual"),
  passed: boolean("passed").notNull(),
  toleranceApplied: doublePrecision("tolerance_applied"),
  difference: doublePrecision("difference"),
  operandMovementRanking: jsonb("operand_movement_ranking").$type<OperandMovement[] | null>(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const criterionInputs = pgTable("criterion_inputs", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id),
  criterionNumber: integer("criterion_number").notNull(),
  paidUpCapital: doublePrecision("paid_up_capital"),
  totalExposure: doublePrecision("total_exposure"),
  currency: text("currency"),
  source: paidUpCapitalSourceEnum("source"),
  sourceDocumentId: text("source_document_id"),
  yearRegisteredSg: integer("year_registered_sg"),
  litigationRecord: litigationRecordEnum("litigation_record"),
  changeInDirectors: boolean("change_in_directors"),
  promptPaymentRecord: promptPaymentRecordEnum("prompt_payment_record"),
  evidenceSource: text("evidence_source"),
  evidencePeriodOrDate: text("evidence_period_or_date"),
  status: fieldStatusEnum("status").notNull().default("Unconfirmed"),
  amendmentHistory: jsonb("amendment_history").$type<AmendmentHistoryEntry[]>().notNull().default([]),
  enteredBy: text("entered_by"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "string" }),
}, (t) => ({
  uniqAssessmentCriterion: uniqueIndex("criterion_inputs_assessment_criterion_idx").on(t.assessmentId, t.criterionNumber),
}));

export const ratios = pgTable("ratios", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id),
  ratioKey: text("ratio_key").notNull(),
  label: text("label").notNull(),
  formulaDisplay: text("formula_display").notNull(),
  lineageFieldIds: jsonb("lineage_field_ids").$type<string[]>().notNull().default([]),
  period: text("period"),
  valueNumeric: doublePrecision("value_numeric"),
  signPair: jsonb("sign_pair").$type<{ currentPositive: boolean | null; priorPositive: boolean | null } | null>(),
  notCalculableReason: text("not_calculable_reason"),
  zeroDivisorField: text("zero_divisor_field"),
  zeroDivisorTierApplied: integer("zero_divisor_tier_applied"),
  scorecardVersion: text("scorecard_version").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  // FR4.10 — a rescore supersedes, never deletes, a prior Ratio; matches
  // risk_commentaries' own supersededAt discipline (FR11.7).
  supersededAt: timestamp("superseded_at", { withTimezone: true, mode: "string" }),
});

export const ratings = pgTable("ratings", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id),
  compositeScore: integer("composite_score").notNull(),
  ratingClass: ratingClassEnum("rating_class").notNull(),
  handlingRoute: text("handling_route").notNull(),
  weightSet: weightSetEnum("weight_set").notNull(),
  driverBreakdown: jsonb("driver_breakdown").$type<CriterionDriver[]>().notNull(),
  scorecardVersion: text("scorecard_version").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  // FR6.12 — a rescore supersedes, never deletes, a prior Rating. Required
  // (not just for audit parity): risk_commentaries.rating_id FKs to this
  // table's id, and a superseded RiskCommentary row (retained per FR11.7)
  // keeps pointing at the Rating it was generated from — hard-deleting that
  // Rating would violate the FK the moment a second rescore ever happens.
  supersededAt: timestamp("superseded_at", { withTimezone: true, mode: "string" }),
});

export const approvalDecisions = pgTable("approval_decisions", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id),
  actor: text("actor").notNull(),
  action: approvalActionEnum("action").notNull(),
  comments: text("comments").notNull().default(""),
  timestamp: timestamp("timestamp", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  policyVersion: text("policy_version").notNull(),
});

export const riskCommentaries = pgTable("risk_commentaries", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id),
  ratingId: text("rating_id").notNull().references(() => ratings.id),
  observations: jsonb("observations").$type<RiskObservation[]>().notNull().default([]),
  noObservations: boolean("no_observations").notNull(),
  modelVersion: text("model_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  supersededAt: timestamp("superseded_at", { withTimezone: true, mode: "string" }),
});

// One row per (assessment, agent) — always the latest state, not a log.
// Overwritten in place on every run; the audit trail of what actually
// happened lives in audit_log, same as everything else in this app.
export const agentActivity = pgTable("agent_activity", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => assessments.id),
  agentType: agentTypeEnum("agent_type").notNull(),
  status: agentStatusEnum("status").notNull(),
  detail: text("detail"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (t) => ({
  uniqAssessmentAgent: uniqueIndex("agent_activity_assessment_agent_idx").on(t.assessmentId, t.agentType),
}));

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  timestamp: timestamp("timestamp", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});
