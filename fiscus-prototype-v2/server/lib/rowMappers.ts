import type { CriterionInput, ExtractedField } from "../../src/types.js";

// Drizzle's column types are structurally text/integer; the domain types in
// src/types.ts narrow fieldName/section/criterionNumber to the PRD's closed
// sets (FR2.2, FR5.2). Every row in these tables was written by this
// codebase's own inserts against those closed sets, so the cast is safe —
// it bridges the DB's structural typing to the domain's nominal one, it
// doesn't paper over an actual validation gap.
export function asExtractedFields<T extends Record<string, unknown>>(rows: T[]): ExtractedField[] {
  return rows as unknown as ExtractedField[];
}

export function asCriterionInputs<T extends Record<string, unknown>>(rows: T[]): CriterionInput[] {
  return rows as unknown as CriterionInput[];
}
