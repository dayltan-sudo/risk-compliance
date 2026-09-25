import { Hono } from "hono";
import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { assessments, extractedFields, criterionInputs } from "../db/schema.js";
import { requireActor } from "../lib/actor.js";
import { writeAudit } from "../lib/audit.js";
import { nowStamp } from "../lib/ids.js";
import { checkReviewCompleteAndRecompute } from "../lib/recompute.js";
import { CONFIDENCE_THRESHOLDS } from "../../src/data/config.js";
import { validateCriterionInput, summarizeCriterionInput } from "../lib/validateCriterionInput.js";
import type { AmendmentHistoryEntry, CriterionNumber } from "../../src/types.js";

export const fieldReviewRoute = new Hono();

// FR3.9 — bulk-confirm every Unconfirmed, High-confidence field-period value
// for the assessment in one action. Confidence is scored per value
// independently; this never touches Medium/Low-confidence or already-reviewed rows.
fieldReviewRoute.post("/:id/bulk-confirm-high", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ error: "Missing actor" }, 400);
  const assessmentId = c.req.param("id");

  const eligible = await db
    .select()
    .from(extractedFields)
    .where(and(eq(extractedFields.assessmentId, assessmentId), eq(extractedFields.status, "Unconfirmed"), gte(extractedFields.confidenceScore, CONFIDENCE_THRESHOLDS.high)));

  if (eligible.length === 0) return c.json({ ok: true, confirmed: 0 });

  await db.transaction(async (tx) => {
    for (const f of eligible) {
      await tx.update(extractedFields).set({ status: "Confirmed" }).where(eq(extractedFields.id, f.id));
    }
  });

  await writeAudit({
    entityType: "ExtractedField",
    entityId: assessmentId,
    actor,
    action: `Bulk-confirmed ${eligible.length} High-confidence field-period items`,
    beforeValue: "Unconfirmed",
    afterValue: "Confirmed",
  });

  await checkReviewCompleteAndRecompute(assessmentId);
  return c.json({ ok: true, confirmed: eligible.length });
});

const criterionValuesSchema = z.object({
  paidUpCapital: z.number().nullable().optional(),
  totalExposure: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  yearRegisteredSg: z.number().nullable().optional(),
  litigationRecord: z.enum(["Clean", "Motor suits only", "Other record"]).nullable().optional(),
  changeInDirectors: z.boolean().nullable().optional(),
  promptPaymentRecord: z.enum(["Good", "Late", "None held"]).nullable().optional(),
  evidenceSource: z.string().nullable().optional(),
  evidencePeriodOrDate: z.string().nullable().optional(),
});

async function loadAssessmentAndCriterion(assessmentId: string, criterionNumber: number) {
  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
  if (!assessment) return { error: "Assessment not found." as const };
  const [input] = await db
    .select()
    .from(criterionInputs)
    .where(and(eq(criterionInputs.assessmentId, assessmentId), eq(criterionInputs.criterionNumber, criterionNumber)));
  if (!input) return { error: "Criterion input not found." as const };
  return { assessment, input: { ...input, criterionNumber: input.criterionNumber as CriterionNumber } };
}

fieldReviewRoute.post("/:id/criteria/:criterionNumber/confirm", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ ok: false, reason: "Missing actor" }, 400);
  const assessmentId = c.req.param("id");
  const criterionNumber = Number(c.req.param("criterionNumber")) as CriterionNumber;

  const parsed = criterionValuesSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, reason: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);

  const loaded = await loadAssessmentAndCriterion(assessmentId, criterionNumber);
  if ("error" in loaded) return c.json({ ok: false, reason: loaded.error }, 404);
  const { assessment, input } = loaded;
  if (input.status !== "Unconfirmed") return c.json({ ok: false, reason: "Already reviewed — use Amend instead." }, 409);

  const validation = validateCriterionInput(criterionNumber, parsed.data, assessment.relationshipType);
  if (!validation.ok) return c.json(validation, 400);

  await db
    .update(criterionInputs)
    .set({ ...parsed.data, status: "Confirmed", confirmedBy: actor, confirmedAt: nowStamp(), source: input.source ?? "manual" })
    .where(eq(criterionInputs.id, input.id));

  await writeAudit({ entityType: "CriterionInput", entityId: input.id, actor, action: `Criterion ${criterionNumber} confirmed`, beforeValue: "Unconfirmed", afterValue: "Confirmed" });
  await checkReviewCompleteAndRecompute(assessmentId);
  return c.json({ ok: true });
});

const amendCriterionSchema = criterionValuesSchema.extend({ reason: z.string().trim().optional() });

fieldReviewRoute.post("/:id/criteria/:criterionNumber/amend", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ ok: false, reason: "Missing actor" }, 400);
  const assessmentId = c.req.param("id");
  const criterionNumber = Number(c.req.param("criterionNumber")) as CriterionNumber;

  const parsed = amendCriterionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, reason: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const { reason, ...values } = parsed.data;

  const loaded = await loadAssessmentAndCriterion(assessmentId, criterionNumber);
  if ("error" in loaded) return c.json({ ok: false, reason: loaded.error }, 404);
  const { assessment, input } = loaded;

  const validation = validateCriterionInput(criterionNumber, values, assessment.relationshipType);
  if (!validation.ok) return c.json(validation, 400);

  const isCriterion5AmountChange = criterionNumber === 5 && values.totalExposure !== undefined && values.totalExposure !== input.totalExposure;
  const entry: AmendmentHistoryEntry = {
    previousValue: summarizeCriterionInput(input),
    previousStatus: input.status,
    newValue: summarizeCriterionInput({ ...input, ...values }),
    newStatus: "Amended",
    reason,
    actor,
    timestamp: nowStamp(),
  };

  await db
    .update(criterionInputs)
    .set({ ...values, status: "Amended", source: criterionNumber === 5 ? "manual" : input.source, amendmentHistory: [...input.amendmentHistory, entry] })
    .where(eq(criterionInputs.id, input.id));

  await writeAudit({
    entityType: "CriterionInput",
    entityId: input.id,
    actor,
    action: `Criterion ${criterionNumber} amended${isCriterion5AmountChange ? " — total exposure changed, rescoring (FR5.4)" : ""}`,
    beforeValue: input.status,
    afterValue: "Amended",
  });

  await checkReviewCompleteAndRecompute(assessmentId);
  return c.json({ ok: true });
});

export default fieldReviewRoute;
