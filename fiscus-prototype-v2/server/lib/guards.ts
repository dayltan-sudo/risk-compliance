import type { Assessment } from "../../src/types.js";

/** Review inputs (fields, criteria, relationship type) are only editable while
 * the assessment is a Draft — a Submitted/Approved/Rejected assessment is what
 * the approver saw and must not change underneath them (FR7). */
export function notDraftMessage(assessment: Pick<Assessment, "state">, what: string): string {
  return `This assessment is ${assessment.state} — ${what} can only be changed while it is a Draft.`;
}
