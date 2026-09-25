import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { assessments, documents, extractedFields, criterionInputs } from "../db/schema.js";
import { nextId, nowDate } from "../lib/ids.js";
import { requireActor } from "../lib/actor.js";
import { writeAudit } from "../lib/audit.js";
import { storeDocument } from "../lib/blob.js";
import { runIntegrityChecksAndRecency, checkReviewCompleteAndRecompute } from "../lib/recompute.js";
import { extractDocumentText } from "../lib/documentText.js";
import { extractPaidUpCapital, extractStatementFields, type StatementExtractionResult } from "../lib/extraction.js";
import { setAgentStatus } from "../lib/agentActivity.js";
import { EXTRACTION_MODEL_VERSION, FIELD_DEFS } from "../../src/data/config.js";
import type { DocumentType, StatementBasis } from "../../src/types.js";

export const documentsRoute = new Hono();

// A statement whose fiscal period the model can't determine (unreadable
// text, missing header) still gets a distinct period slot rather than
// blocking the upload (FR2.9) — keyed off financialsDate's year, since that
// falls back to today when it's equally undeterminable.
function fallbackPeriod(existingPeriods: string[], financialsDate: string): string {
  const year = new Date(financialsDate).getFullYear();
  let label = `FY${year}`;
  let suffix = 2;
  while (existingPeriods.includes(label)) {
    label = `FY${year} (${suffix++})`;
  }
  return label;
}

// FR1/FR2 — Intake + Extraction (Flow A/B/D in Statement Extraction.md).
// Extraction calls the real LLM (DeepSeek V4.1 Flash via OpenCode Go) over
// the document's extracted text. A failure anywhere in text extraction or
// the model call is caught and never blocks the upload — Flow B's skeleton
// rows (Node 1) are always created first and unconditionally, so an
// unreadable statement still yields 11 reviewable, all-null rows rather than
// zero (FR2.9) — the same contract the synthesized stand-in honored.
documentsRoute.post("/:id/documents", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ error: "Missing actor" }, 400);
  const assessmentId = c.req.param("id");

  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
  if (!assessment) return c.json({ error: "Assessment not found" }, 404);
  if (assessment.state !== "Draft") return c.json({ error: "Documents may only be uploaded to a Draft assessment (FR1)." }, 409);

  const body = await c.req.parseBody().catch(() => null);
  if (!body || !(body.file instanceof File)) return c.json({ error: "A file is required." }, 400);

  const file = body.file;
  const type = body.type as DocumentType;
  if (!type || !["audited", "unaudited", "registry"].includes(type)) return c.json({ error: "A valid document type is required." }, 400);

  const blobUrl = await storeDocument(file, assessmentId);
  const docId = nextId("doc");

  if (type === "registry") {
    await db.insert(documents).values({
      id: docId,
      assessmentId,
      type: "registry",
      period: null,
      financialsDate: null,
      presentationCurrency: null,
      presentationScale: null,
      statementBasis: null,
      uploader: actor,
      fileName: file.name,
      blobUrl,
      supersedesDocumentId: null,
    });
    await writeAudit({ entityType: "Document", entityId: docId, actor, action: "Registry document uploaded", beforeValue: null, afterValue: file.name });

    // FR5.8 tier 1 — ACRA registry governs paid-up capital, but never
    // overwrites an already-Confirmed/Amended criterion 5 row.
    const [c5] = await db.select().from(criterionInputs).where(and(eq(criterionInputs.assessmentId, assessmentId), eq(criterionInputs.criterionNumber, 5)));
    if (c5 && c5.status === "Unconfirmed") {
      await setAgentStatus(assessmentId, "extraction", "running", "Reading paid-up capital from ACRA registry document");
      try {
        const text = await extractDocumentText(file);
        if (text.trim().length > 0) {
          const candidate = await extractPaidUpCapital({ text, documentKind: "registry", sessionId: `paidup-registry-${docId}` });
          if (candidate.value !== null) {
            await db
              .update(criterionInputs)
              .set({ paidUpCapital: candidate.value, currency: "SGD", source: "registry", sourceDocumentId: docId })
              .where(eq(criterionInputs.id, c5.id));
            await writeAudit({
              entityType: "CriterionInput",
              entityId: c5.id,
              actor: "system",
              action: "Paid-up capital prefilled from ACRA registry (FR5.8)",
              beforeValue: null,
              afterValue: String(candidate.value),
            });
            await setAgentStatus(assessmentId, "extraction", "done", `Paid-up capital found: ${candidate.value.toLocaleString()}`);
          } else {
            await setAgentStatus(assessmentId, "extraction", "done", "Paid-up capital not found in registry document");
          }
        } else {
          await setAgentStatus(assessmentId, "extraction", "done", "Registry document had no readable text");
        }
      } catch (err) {
        // Registry document unreadable/model call failed — falls through to
        // tier 2 (statement note) or tier 3 (blank), never blocks the upload
        // (Statement Extraction.md §8: "never blocks the assessment").
        await setAgentStatus(assessmentId, "extraction", "failed", err instanceof Error ? err.message : String(err));
      }
    }
    return c.json({ id: docId }, 201);
  }

  const statementBasis = (String(body.statementBasis ?? "standalone") as StatementBasis);

  // Period, financials date, presentation currency, and presentation scale
  // are no longer uploader-declared — the model determines all four by
  // reading the statement itself (its header, column labels, and notes),
  // alongside the FR2.2 field set, in the same call.
  let documentText = "";
  let extraction: StatementExtractionResult | null = null;
  await setAgentStatus(assessmentId, "extraction", "running", "Reading statement — detecting period, currency, scale, and fields");
  try {
    documentText = await extractDocumentText(file);
    if (documentText.trim().length > 0) {
      extraction = await extractStatementFields({ text: documentText, sessionId: `extract-${docId}` });
    }
  } catch (err) {
    await writeAudit({
      entityType: "Document",
      entityId: docId,
      actor: "system",
      action: "Extraction failed — skeleton rows created with no values (FR2.9)",
      beforeValue: null,
      afterValue: err instanceof Error ? err.message : String(err),
    });
    await setAgentStatus(assessmentId, "extraction", "failed", err instanceof Error ? err.message : String(err));
  }

  const financialsDate = extraction?.financialsDate || nowDate();
  const presentationCurrency = extraction?.presentationCurrency || "SGD";
  const presentationScale = extraction?.presentationScale || "units";
  const period = extraction?.period?.trim() || fallbackPeriod(assessment.periods, financialsDate);

  if (assessment.periods.length >= 2 && !assessment.periods.includes(period)) {
    return c.json({ error: "Exactly two fiscal periods per assessment (FR1.3) — this assessment already has its two periods." }, 409);
  }

  await db.insert(documents).values({
    id: docId,
    assessmentId,
    type,
    period,
    financialsDate,
    presentationCurrency,
    presentationScale,
    statementBasis,
    uploader: actor,
    fileName: file.name,
    blobUrl,
    supersedesDocumentId: null,
  });

  if (extraction) {
    await setAgentStatus(
      assessmentId,
      "extraction",
      "done",
      `${extraction.fields.length} of ${FIELD_DEFS.length} fields found in ${period} statement (${presentationCurrency}, ${presentationScale})`,
    );
  } else if (documentText.trim().length === 0) {
    await setAgentStatus(assessmentId, "extraction", "done", `${period} statement had no readable text — skeleton created, all fields absent`);
  }

  // Flow B, Node 1 — skeleton assembly is deterministic and unconditional:
  // it must run whether or not the model call above ever succeeded (FR2.9).
  const byFieldName = new Map((extraction?.fields ?? []).map((f) => [f.fieldName, f]));

  const newFields = FIELD_DEFS.map((fdef) => {
    const found = byFieldName.get(fdef.name);
    const value = found && typeof found.value === (fdef.valueType === "boolean" ? "boolean" : "number") ? found.value : null;
    return {
      id: nextId("f"),
      assessmentId,
      documentId: docId,
      fieldName: fdef.name,
      section: fdef.section,
      period,
      value,
      originalExtractedValue: value,
      scaleApplied: presentationScale,
      currency: presentationCurrency,
      confidenceScore: value === null ? null : found!.confidence,
      sourcePointer: value === null ? null : found!.sourcePointer,
      extractionModelVersion: EXTRACTION_MODEL_VERSION,
      status: "Unconfirmed" as const,
      amendmentHistory: [],
    };
  });

  await db.transaction(async (tx) => {
    // FR1.5 — re-uploading a period replaces its field skeleton, never
    // overwrites a document version; the old skeleton's confirmations don't
    // carry over to a re-extraction (matches useStore.ts's uploadDocument).
    await tx.delete(extractedFields).where(and(eq(extractedFields.assessmentId, assessmentId), eq(extractedFields.period, period)));
    await tx.insert(extractedFields).values(newFields);
    if (!assessment.periods.includes(period)) {
      await tx.update(assessments).set({ periods: [...assessment.periods, period].sort() }).where(eq(assessments.id, assessmentId));
    }
  });

  await writeAudit({ entityType: "Document", entityId: docId, actor, action: `Document uploaded (${type}, ${period})`, beforeValue: null, afterValue: file.name });

  // FR5.8 tier 2 — only if tier 1 (registry) hasn't already sourced a value
  // and criterion 5 is still Unconfirmed; never overwrites a confirmed row.
  const [c5] = await db.select().from(criterionInputs).where(and(eq(criterionInputs.assessmentId, assessmentId), eq(criterionInputs.criterionNumber, 5)));
  if (c5 && c5.status === "Unconfirmed" && c5.paidUpCapital === null && documentText.trim().length > 0) {
    await setAgentStatus(assessmentId, "extraction", "running", "Checking statement's share-capital note for paid-up capital");
    try {
      const candidate = await extractPaidUpCapital({ text: documentText, documentKind: "statement-note", sessionId: `paidup-note-${docId}` });
      if (candidate.value !== null) {
        await db
          .update(criterionInputs)
          .set({ paidUpCapital: candidate.value, currency: "SGD", source: "statement-note", sourceDocumentId: docId })
          .where(eq(criterionInputs.id, c5.id));
        await writeAudit({
          entityType: "CriterionInput",
          entityId: c5.id,
          actor: "system",
          action: "Paid-up capital prefilled from statement share-capital note (FR5.8)",
          beforeValue: null,
          afterValue: String(candidate.value),
        });
        await setAgentStatus(assessmentId, "extraction", "done", `Paid-up capital found in share-capital note: ${candidate.value.toLocaleString()}`);
      } else {
        await setAgentStatus(assessmentId, "extraction", "done", "Paid-up capital not found in share-capital note");
      }
    } catch (err) {
      // Falls through to tier 3 (blank, manual entry in Field Review).
      await setAgentStatus(assessmentId, "extraction", "failed", err instanceof Error ? err.message : String(err));
    }
  }

  await runIntegrityChecksAndRecency(assessmentId);
  await checkReviewCompleteAndRecompute(assessmentId);

  return c.json({ id: docId }, 201);
});

export default documentsRoute;
