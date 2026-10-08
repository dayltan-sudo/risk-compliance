import type { CriterionInputStatus, CriterionNumber, LitigationRecord, PromptPaymentRecord, RelationshipType } from "../../src/types.js";

export interface CriterionInputValues {
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

const MIN_YEAR_REGISTERED = 1800;

interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/** Field Review.md §8's per-criterion validation table (FR5.6, FR5.10,
 * FR5.12, FR5.15, FR5.5) — ported verbatim from useStore.ts's
 * validateCriterionInput. Runs on both Confirm and Amend. */
export function validateCriterionInput(
  criterionNumber: CriterionNumber,
  v: CriterionInputValues,
  relationshipType: RelationshipType,
  assessmentYear: number,
): ValidationResult {
  if (criterionNumber === 5) {
    if (v.paidUpCapital === null || v.paidUpCapital === undefined || v.totalExposure === null || v.totalExposure === undefined) {
      return { ok: false, reason: "Paid-up capital and total exposure are both required." };
    }
    if (!(v.paidUpCapital > 0)) return { ok: false, reason: "Paid-up capital must be greater than zero." };
    if (!(v.totalExposure > 0)) return { ok: false, reason: "Total exposure must be greater than zero (FR5.15)." };
    if (!v.currency?.trim()) return { ok: false, reason: "Currency is required — paid-up capital and total exposure must be in the same currency (FR5.6)." };
    return { ok: true };
  }
  if (criterionNumber === 7) {
    if (v.yearRegisteredSg === null || v.yearRegisteredSg === undefined) return { ok: false, reason: "Year registered in Singapore is required." };
    if (!Number.isInteger(v.yearRegisteredSg) || v.yearRegisteredSg < MIN_YEAR_REGISTERED || v.yearRegisteredSg > assessmentYear) {
      return { ok: false, reason: `Year registered in Singapore must be a year between ${MIN_YEAR_REGISTERED} and ${assessmentYear}.` };
    }
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

/** FR5.6 — a prefilled paid-up capital figure was read in one currency; the
 * reviewer cannot relabel it to another without also changing the figure
 * (the system converts nothing). */
export function checkPaidUpCurrencyMatch(
  existing: { source: string | null; currency: string | null; paidUpCapital: number | null },
  v: CriterionInputValues,
): ValidationResult {
  const prefilled = existing.source === "registry" || existing.source === "statement-note";
  if (!prefilled || !existing.currency || !v.currency) return { ok: true };
  if (existing.currency.toUpperCase() === v.currency.toUpperCase()) return { ok: true };
  if (v.paidUpCapital !== existing.paidUpCapital) return { ok: true };
  return {
    ok: false,
    reason: `Paid-up capital was read from the ${existing.source} in ${existing.currency}. Currency ${v.currency} does not match — enter the capital in ${v.currency} or keep ${existing.currency} (FR5.6).`,
  };
}

export function summarizeCriterionInput(c: { criterionNumber: CriterionNumber } & CriterionInputValues): string {
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

export type { CriterionInputStatus };
