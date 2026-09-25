import type { CriterionInput, CriterionNumber, ExtractedField, StandardFieldName } from "../../types.js";
import { EXTRACTION_MODEL_VERSION, FIELD_DEFS } from "../../data/config.js";

// Shared builders for engine parity tests. Not a test file itself (no
// describe/it), so vitest's default include glob skips it.

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function field(period: string, name: StandardFieldName, value: number | boolean | null): ExtractedField {
  return {
    id: nextId("f"),
    assessmentId: "a-test",
    documentId: "doc-test",
    fieldName: name,
    section: FIELD_DEFS.find((d) => d.name === name)!.section,
    period,
    value,
    originalExtractedValue: value,
    scaleApplied: "units",
    currency: "SGD",
    confidenceScore: value === null ? null : 95,
    sourcePointer: "p.1",
    extractionModelVersion: EXTRACTION_MODEL_VERSION,
    status: "Confirmed", // FR3.5 — a null value here means confirmed absent, not Unconfirmed
    amendmentHistory: [],
  };
}

/** Builds one period's confirmed fields from a partial value map — only the
 * fields a test cares about, mirroring how a real assessment only ever
 * carries the FR2.2 set for fields extraction actually produced. */
export function fieldsForPeriod(period: string, values: Partial<Record<StandardFieldName, number | boolean | null>>): ExtractedField[] {
  return (Object.keys(values) as StandardFieldName[]).map((name) => field(period, name, values[name] ?? null));
}

export function criterionInput(number: CriterionNumber, overrides: Partial<CriterionInput> = {}): CriterionInput {
  return {
    id: nextId("crit"),
    assessmentId: "a-test",
    criterionNumber: number,
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
    status: "Confirmed",
    amendmentHistory: [],
    enteredBy: "u-test",
    confirmedBy: "u-test",
    confirmedAt: "2026-01-01",
    ...overrides,
  };
}

export const NOW = "2026-01-01T00:00:00.000Z";
