import { z } from "zod";
import { callStructuredLLM } from "./llm.js";
import { FIELD_DEFS } from "../../src/data/config.js";
import type { PresentationScale, StandardFieldName } from "../../src/types.js";

// FR2 — the one genuinely agentic surface besides Risk Commentary. Maps an
// arbitrary statement's line items onto the closed FR2.2 field set, at raw
// absolute value, with a calibrated confidence and a source pointer — never
// auto-confirms (Statement Extraction.md Flow B/C).

const fieldNames = FIELD_DEFS.map((f) => f.name) as [StandardFieldName, ...StandardFieldName[]];

const ExtractedFieldSchema = z.object({
  fieldName: z.enum(fieldNames),
  value: z.union([z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(100).nullable(),
  sourcePointer: z.string().nullable(),
});

const ExtractionResponseSchema = z.object({
  period: z.string().nullable(),
  financialsDate: z.string().nullable(),
  presentationCurrency: z.string().nullable(),
  presentationScale: z.enum(["units", "thousands", "millions"]).nullable(),
  fields: z.array(ExtractedFieldSchema),
});

export interface ExtractedFieldCandidate {
  fieldName: StandardFieldName;
  value: number | boolean | null;
  confidence: number | null;
  sourcePointer: string | null;
}

export interface StatementExtractionResult {
  period: string | null;
  financialsDate: string | null;
  presentationCurrency: string | null;
  presentationScale: PresentationScale | null;
  fields: ExtractedFieldCandidate[];
}

function buildFieldSetDescription(): string {
  return FIELD_DEFS.map((f) => `- ${f.name} — ${f.section} — ${f.valueType}`).join("\n");
}

function buildExtractionSystemPrompt(): string {
  return `You are a financial statement extraction assistant for a credit assessment tool. You will be given the raw text of one uploaded financial statement covering a single fiscal period.

First, determine the statement's intake metadata by reading its header, column labels, and notes:
- period: a short fiscal-period label in the style "FY2027", taken from the statement's fiscal year end or the column heading for the period being extracted (use the latest/current period if the statement shows more than one column of figures). Null only if genuinely undeterminable.
- financialsDate: the ISO date (YYYY-MM-DD) the statement is drawn up "as at" — normally the balance sheet date. Null only if genuinely undeterminable.
- presentationCurrency: the currency the figures are presented in (e.g. "SGD", "USD"), read from the statement header or notes (e.g. "S$'000" means SGD). Null only if genuinely undeterminable.
- presentationScale: one of "units", "thousands", or "millions" — the scale the raw figures are presented at (e.g. a header reading "(S$'000)" or "in thousands" means "thousands"; no such indication means "units"). Null only if genuinely undeterminable.

Then extract ONLY the following standardized fields. Map arbitrary line-item labels in the statement onto this closed set — do not invent fields outside it, and do not skip a field just because its label isn't an exact match.

${buildFieldSetDescription()}

"Net Operating Cash Flow Positive" is a sign test: true if net operating cash flow for the latest fiscal year in this statement is positive, false if negative or zero, null only if there is genuinely no cash-flow statement at all (common in unaudited management accounts — this is an expected absence, not an error).

Convert every "amount" field to its true absolute value using the presentationScale and presentationCurrency you determined above — e.g. if the scale is "thousands" and a line reads 1,234, the true value is 1234000. Do not apply any scale conversion to the boolean field.

For every field return:
- confidence: your calibrated confidence 0-100 that the value is correct and correctly mapped, or null if you did not find the field at all
- sourcePointer: a short pointer to where you found it (e.g. "Balance Sheet, 'Total Assets' row", with a page number if visible), or null if not found

If a field is not present in the statement, set its value, confidence, and sourcePointer all to null. Never guess a value.

Respond with ONLY a single JSON object of this exact shape, no markdown fences, no commentary:
{"period": string|null, "financialsDate": string|null, "presentationCurrency": string|null, "presentationScale": "units"|"thousands"|"millions"|null, "fields": [{"fieldName": string, "value": number|boolean|null, "confidence": number|null, "sourcePointer": string|null}, ...]}

Include exactly one entry per field name listed above.`;
}

const MAX_DOCUMENT_CHARS = 150_000;
const STATEMENT_WINDOW_CHARS = 140_000;
const STATEMENT_WINDOW_LEAD_CHARS = 20_000;

// A standalone statement is short enough to send in full, but a full annual
// report can run to hundreds of pages of governance/remuneration front
// matter before the actual financial statements — naive head-truncation
// cuts the real balance sheet out entirely while still picking up an
// incidental early mention of something like "share capital" in the
// governance section, which is exactly what produces a result with only
// that one field populated. "total assets", "total liabilities", and "total
// equity" landing within a couple thousand characters of each other only
// happens inside an actual statement of financial position table, never in
// a table of contents or prose reference — so that clustering, not document
// position, is what anchors the extraction window.
function selectRelevantText(text: string): string {
  if (text.length <= MAX_DOCUMENT_CHARS) return text;

  const lower = text.toLowerCase();
  const CLUSTER_SPAN = 2000;
  let anchor = -1;
  for (let from = 0; ; ) {
    const i = lower.indexOf("total assets", from);
    if (i === -1) break;
    const nearby = lower.slice(i, i + CLUSTER_SPAN);
    if (nearby.includes("total liabilities") && nearby.includes("total equity")) {
      anchor = i;
      break;
    }
    from = i + 1;
  }

  if (anchor === -1) return text.slice(0, MAX_DOCUMENT_CHARS);
  const start = Math.max(0, anchor - STATEMENT_WINDOW_LEAD_CHARS);
  return text.slice(start, start + STATEMENT_WINDOW_CHARS);
}

export async function extractStatementFields(opts: { text: string; sessionId: string }): Promise<StatementExtractionResult> {
  return callStructuredLLM({
    system: buildExtractionSystemPrompt(),
    user: selectRelevantText(opts.text),
    schema: ExtractionResponseSchema,
    sessionId: opts.sessionId,
  });
}

// FR5.8 — Flow D's paid-up capital prefill. Same extraction capability as
// Flow B, scoped to one figure, used for both the registry document (tier 1)
// and a statement's share-capital note (tier 2).
const PaidUpCapitalSchema = z.object({
  value: z.number().nullable(),
  confidence: z.number().min(0).max(100).nullable(),
  sourcePointer: z.string().nullable(),
});

export interface PaidUpCapitalCandidate {
  value: number | null;
  confidence: number | null;
  sourcePointer: string | null;
}

export async function extractPaidUpCapital(opts: {
  text: string;
  documentKind: "registry" | "statement-note";
  sessionId: string;
}): Promise<PaidUpCapitalCandidate> {
  const source = opts.documentKind === "registry" ? "an ACRA business registry extract" : "a financial statement's share-capital note";
  const system = `You are extracting a single figure from ${source}: the company's paid-up capital (also called "issued and paid-up share capital"), as at the date on the document.

Respond with ONLY a single JSON object of this exact shape, no markdown fences, no commentary:
{"value": number|null, "confidence": number|null, "sourcePointer": string|null}

If the figure is not present, set all three fields to null. Never guess.`;
  return callStructuredLLM({
    system,
    user: selectRelevantText(opts.text),
    schema: PaidUpCapitalSchema,
    sessionId: opts.sessionId,
  });
}
