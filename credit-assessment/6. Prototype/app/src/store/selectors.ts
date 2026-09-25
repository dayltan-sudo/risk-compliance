import type { AppDocument, Assessment, CriterionInput, CriterionNumber, ExtractedField, Rating, RelationshipType } from "../types";

export function assessmentsForCustomerDivision(assessments: Assessment[], customerId: string, division: string): Assessment[] {
  return assessments.filter((a) => a.customerId === customerId && a.division === division).sort((a, b) => b.version - a.version);
}

export function mostRecentAssessmentForPair(assessments: Assessment[], customerId: string, division: string): Assessment | undefined {
  return assessmentsForCustomerDivision(assessments, customerId, division)[0];
}

/** FR8.3 — at most one non-terminal (Draft/Submitted) assessment per
 * (customer, division) pair; resume it rather than creating a second. */
export function openAssessmentForPair(assessments: Assessment[], customerId: string, division: string): Assessment | undefined {
  return assessments.find((a) => a.customerId === customerId && a.division === division && (a.state === "Draft" || a.state === "Submitted"));
}

/** FR5.13 — Renewal iff this (customer, division) pair has at least one
 * Approved assessment; New otherwise. Scoped to the pair, not the customer. */
export function deriveRelationshipType(assessments: Assessment[], customerId: string, division: string): RelationshipType {
  const hasApproved = assessments.some((a) => a.customerId === customerId && a.division === division && a.state === "Approved");
  return hasApproved ? "Renewal" : "New";
}

/** FR8.4 — the Customer Directory's distinct (customer, division) pairs, one
 * row per pair with at least one assessment. */
export function customerDivisionPairs(assessments: Assessment[]): { customerId: string; division: string }[] {
  const seen = new Set<string>();
  const pairs: { customerId: string; division: string }[] = [];
  for (const a of assessments) {
    const key = `${a.customerId}|${a.division}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ customerId: a.customerId, division: a.division });
  }
  return pairs;
}

/** FR8.4 — that division's most recent Approved assessment's class, not just
 * the most recent assessment's class. */
export function mostRecentApprovedClass(assessments: Assessment[], ratings: Rating[], customerId: string, division: string): Rating | undefined {
  const approved = assessmentsForCustomerDivision(assessments, customerId, division).filter((a) => a.state === "Approved");
  if (approved.length === 0) return undefined;
  return ratings.find((r) => r.assessmentId === approved[0].id);
}

/** FR1.5 — re-uploading a period creates a new document version; it never
 * overwrites the prior one. The prior version's document row and its
 * ExtractedField rows stay in the store for audit, but only the latest
 * version per period (plus any registry document, which isn't
 * period-versioned) is live for review and computation. */
export function liveDocumentIds(documents: AppDocument[], assessmentId: string): Set<string> {
  const latestByPeriod = new Map<string, AppDocument>();
  const ids = new Set<string>();
  for (const d of documents) {
    if (d.assessmentId !== assessmentId) continue;
    if (d.type === "registry") {
      ids.add(d.id);
      continue;
    }
    if (!d.period) continue;
    const existing = latestByPeriod.get(d.period);
    if (!existing || d.version > existing.version) latestByPeriod.set(d.period, d);
  }
  for (const d of latestByPeriod.values()) ids.add(d.id);
  return ids;
}

/** The live ExtractedField rows for an assessment — excludes fields tied to
 * a superseded document version (FR1.5). Superseded fields remain in the
 * store for audit but never feed review counts or computation. */
export function liveExtractedFields(fields: ExtractedField[], documents: AppDocument[], assessmentId: string): ExtractedField[] {
  const liveIds = liveDocumentIds(documents, assessmentId);
  return fields.filter((f) => f.assessmentId === assessmentId && liveIds.has(f.documentId));
}

/** FR3.11 — one review item per field-period cell, plus one per applicable
 * criterion input (4 for New — criterion 11 excluded, FR5.5; 5 for Renewal). */
export function reviewProgress(fields: ExtractedField[], criterionInputs: CriterionInput[], assessmentId: string, relationshipType: RelationshipType) {
  const fieldItems = fields.filter((f) => f.assessmentId === assessmentId);
  const criterionItems = criterionInputs.filter((c) => c.assessmentId === assessmentId && applicableCriterion(c.criterionNumber, relationshipType));
  const total = fieldItems.length + criterionItems.length;
  const reviewed = fieldItems.filter((f) => f.status !== "Unconfirmed").length + criterionItems.filter((c) => c.status !== "Unconfirmed").length;
  return { total, reviewed, pct: total === 0 ? 0 : Math.round((reviewed / total) * 100) };
}

function applicableCriterion(n: CriterionNumber, relationshipType: RelationshipType): boolean {
  return n !== 11 || relationshipType === "Renewal";
}

/** FR3.8 — the hard compute gate. Nothing computes while any review item is
 * Unconfirmed. False when either period hasn't been uploaded yet, since no
 * ratio can be computed without both. */
export function reviewComplete(
  fields: ExtractedField[],
  criterionInputs: CriterionInput[],
  assessment: Assessment,
): boolean {
  if (assessment.periods.length < 2) return false;
  const fieldItems = fields.filter((f) => f.assessmentId === assessment.id);
  if (fieldItems.length === 0 || fieldItems.some((f) => f.status === "Unconfirmed")) return false;
  const criterionItems = criterionInputs.filter((c) => c.assessmentId === assessment.id && applicableCriterion(c.criterionNumber, assessment.relationshipType));
  if (criterionItems.length === 0 || criterionItems.some((c) => c.status === "Unconfirmed")) return false;
  return true;
}

/** FR7.4 — "Returned for Revision" is not a persisted state; it's Draft whose
 * most recent decision was a Return. Disappears the moment it's resubmitted. */
export function isReturnedForRevision(
  assessment: Assessment,
  approvalDecisions: { assessmentId: string; action: string; timestamp: string }[],
): boolean {
  if (assessment.state !== "Draft") return false;
  const decisions = approvalDecisions.filter((d) => d.assessmentId === assessment.id).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const last = decisions[decisions.length - 1];
  return last?.action === "Return";
}

export function lastReturnComment(
  assessment: Assessment,
  approvalDecisions: { assessmentId: string; action: string; comments: string; timestamp: string }[],
): string | undefined {
  const decisions = approvalDecisions.filter((d) => d.assessmentId === assessment.id && d.action === "Return").sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return decisions[0]?.comments;
}
