import type { CriterionInput, CriterionNumber } from "../../src/types.js";
import { nextId } from "./ids.js";

/** FR5.1 — the five non-financial criterion inputs, created Unconfirmed
 * alongside every new Assessment (mirrors useStore.ts's emptyCriterionInput). */
export function emptyCriterionInput(assessmentId: string, criterionNumber: CriterionNumber): CriterionInput {
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

export const CRITERION_NUMBERS: CriterionNumber[] = [5, 7, 8, 9, 11];
