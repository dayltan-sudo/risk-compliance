import type { Assessment, AuditLogEntry, Customer, ExtractedField, Ratio, User } from "../types";
import { USERS } from "../data/seed";

export function getUser(id: string): User | undefined {
  return USERS.find((u) => u.id === id);
}

export function assessmentsForCustomer(assessments: Assessment[], customerId: string): Assessment[] {
  return assessments.filter((a) => a.customerId === customerId).sort((a, b) => b.version - a.version);
}

export function mostRecentAssessment(assessments: Assessment[], customerId: string): Assessment | undefined {
  return assessmentsForCustomer(assessments, customerId)[0];
}

/** FR3.9 — one review item per field-period cell; Not Present counts as reviewed. */
export function reviewProgress(fields: ExtractedField[], assessmentId: string) {
  const items = fields.filter((f) => f.assessmentId === assessmentId);
  const reviewed = items.filter((f) => f.status !== "Unconfirmed").length;
  return { total: items.length, reviewed, pct: items.length === 0 ? 0 : Math.round((reviewed / items.length) * 100) };
}

/** FR3.10 — blocks submission while any Provisional ratio remains, in any period. */
export function hasProvisionalRatio(ratios: Ratio[], assessmentId: string): boolean {
  return ratios.some((r) => r.assessmentId === assessmentId && r.provisionalFlag);
}

export function hasNotCalculableRatio(ratios: Ratio[], assessmentId: string): boolean {
  return ratios.some((r) => r.assessmentId === assessmentId && r.notCalculableFlag);
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

/** NFR Confidentiality/RBAC — Analyst: own + team. Approver: (prototype choice,
 * §5 doesn't fully specify directory scope) all customers, for browsing outcomes
 * of what they decide. Auditor: customers with >=1 completed assessment (FR8.10
 * default; broadening to non-completed is OPEN in the PRD, §5). */
export function customerVisibleToUser(
  user: User,
  customer: Customer,
  customerAssessments: Assessment[],
): boolean {
  if (user.role === "Approver") return true;
  if (user.role === "Auditor") return customerAssessments.some((a) => a.state === "Approved" || a.state === "Rejected");
  // Analyst
  const owner = getUser(customer.relationshipOwner);
  return customer.relationshipOwner === user.id || (!!owner && owner.team === user.team);
}

/** NFR RBAC / FR9.3 — Approver, Admin, Auditor read the full log by default.
 * FR9.3's Analyst-own-assessments question is OPEN; this prototype resolves it
 * as "yes, scoped to assessments they can see" rather than leaving it blank. */
export function auditLogVisibleToUser(
  user: User,
  entries: AuditLogEntry[],
  assessments: Assessment[],
  customers: Customer[],
): AuditLogEntry[] {
  if (user.role === "Approver" || user.role === "Auditor") return entries;
  // Analyst: entries whose entity traces back to an assessment/customer they can see
  const visibleAssessmentIds = new Set(
    assessments
      .filter((a) => {
        const customer = customers.find((c) => c.id === a.customerId);
        if (!customer) return false;
        return customerVisibleToUser(user, customer, assessments.filter((x) => x.customerId === customer.id));
      })
      .map((a) => a.id),
  );
  return entries.filter((e) => visibleAssessmentIds.has(e.entityId) || visibleAssessmentIds.has(e.entityId));
}
