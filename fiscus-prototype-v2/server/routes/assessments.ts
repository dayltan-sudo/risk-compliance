import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  assessments,
  criterionInputs,
  documents,
  extractedFields,
  integrityCheckResults,
  ratios,
  ratings,
  riskCommentaries,
  approvalDecisions,
} from "../db/schema.js";
import { nextId, nowDate } from "../lib/ids.js";
import { requireActor } from "../lib/actor.js";
import { writeAudit } from "../lib/audit.js";
import { emptyCriterionInput, CRITERION_NUMBERS } from "../lib/criterionSkeleton.js";
import { canApprove, canReturn, canSubmit, POLICY_VERSION } from "../lib/policy.js";
import { deriveRelationshipType, openAssessmentForPair } from "../../src/store/selectors.js";
import { getAgentActivity } from "../lib/agentActivity.js";
import type { Assessment } from "../../src/types.js";

export const assessmentsRoute = new Hono();

const startAssessmentSchema = z.object({
  customerId: z.string().min(1),
  division: z.string().min(1),
});

// FR8.3/FR5.13/FR8.2 — resolves (customer, division), resumes an open
// non-terminal assessment if one exists, otherwise mints the next version
// with a derived relationship type and the FR5.1 criterion-input skeleton.
assessmentsRoute.post("/", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ error: "Missing actor" }, 400);

  const parsed = startAssessmentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const { customerId, division } = parsed.data;

  const allForPair = await db.select().from(assessments).where(and(eq(assessments.customerId, customerId), eq(assessments.division, division)));

  const existing = openAssessmentForPair(allForPair, customerId, division);
  if (existing) return c.json(existing);

  const relationshipType = deriveRelationshipType(allForPair, customerId, division);
  const id = nextId("a");
  const now = nowDate();

  const assessment: Assessment = {
    id,
    customerId,
    division,
    version: allForPair.length + 1,
    state: "Draft",
    relationshipType,
    relationshipTypeOverridden: false,
    relationshipTypeOverrideReason: null,
    assessmentYear: new Date().getFullYear(),
    recencyFlag: null,
    periods: [],
    productType: null,
    contractStartDate: null,
    contractPeriodMonths: null,
    contractValueOrAverageDemand: null,
    principalActivities: null,
    parentageShareholding: null,
    auditedFinancialsFlag: null,
    createdBy: actor,
    createdAt: now,
    submittedBy: null,
    submittedAt: null,
  };

  await db.transaction(async (tx) => {
    await tx.insert(assessments).values(assessment);
    await tx.insert(criterionInputs).values(CRITERION_NUMBERS.map((n) => emptyCriterionInput(id, n)));
  });

  await writeAudit({
    entityType: "Assessment",
    entityId: id,
    actor,
    action: `New Assessment created (v${assessment.version}, ${relationshipType}, ${division})`,
    beforeValue: null,
    afterValue: "Draft",
  });

  return c.json(assessment, 201);
});

// UI-only status feed for the workspace's agent-activity panel — cheap and
// meant to be polled on a short interval, unlike the full detail bundle below.
assessmentsRoute.get("/:id/agent-activity", async (c) => {
  const id = c.req.param("id");
  return c.json({ agents: await getAgentActivity(id) });
});

// FR8.6 — full read-only bundle for the assessment workspace: the assessment
// plus every child collection scoped to it. Not gated on state — Draft,
// Submitted, Approved and Rejected all read the same shape.
assessmentsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, id));
  if (!assessment) return c.json({ error: "Assessment not found" }, 404);

  const [docs, fields, criteria, checks, ratioRows, ratingRows, decisions] = await Promise.all([
    db.select().from(documents).where(eq(documents.assessmentId, id)),
    db.select().from(extractedFields).where(eq(extractedFields.assessmentId, id)),
    db.select().from(criterionInputs).where(eq(criterionInputs.assessmentId, id)),
    db.select().from(integrityCheckResults).where(eq(integrityCheckResults.assessmentId, id)),
    db.select().from(ratios).where(and(eq(ratios.assessmentId, id), isNull(ratios.supersededAt))),
    db.select().from(ratings).where(and(eq(ratings.assessmentId, id), isNull(ratings.supersededAt))),
    db.select().from(approvalDecisions).where(eq(approvalDecisions.assessmentId, id)),
  ]);

  const rating = ratingRows[0];
  const commentary = rating
    ? (await db.select().from(riskCommentaries).where(and(eq(riskCommentaries.ratingId, rating.id), isNull(riskCommentaries.supersededAt))))[0]
    : undefined;

  return c.json({
    assessment,
    documents: docs,
    extractedFields: fields,
    criterionInputs: criteria,
    integrityChecks: checks,
    ratios: ratioRows,
    rating: rating ?? null,
    riskCommentary: commentary ?? null,
    approvalDecisions: decisions,
  });
});

const overrideSchema = z.object({ newValue: z.enum(["New", "Renewal"]), reason: z.string().trim().min(1) });

assessmentsRoute.patch("/:id/relationship-type", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ error: "Missing actor" }, 400);
  const id = c.req.param("id");

  const parsed = overrideSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "A reason is required to override the relationship type (FR5.13)." }, 400);

  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, id));
  if (!assessment) return c.json({ error: "Assessment not found" }, 404);

  const { newValue, reason } = parsed.data;
  if (assessment.relationshipType === newValue) return c.json(assessment);

  await db.transaction(async (tx) => {
    await tx
      .update(assessments)
      .set({ relationshipType: newValue, relationshipTypeOverridden: true, relationshipTypeOverrideReason: reason })
      .where(eq(assessments.id, id));

    // FR5.14 — switching to Renewal never inherits a value from before a
    // prior New designation; criterion 11 always starts Unconfirmed on reveal.
    if (newValue === "Renewal") {
      const { id: _discard, ...fresh } = emptyCriterionInput(id, 11);
      await tx
        .update(criterionInputs)
        .set(fresh)
        .where(and(eq(criterionInputs.assessmentId, id), eq(criterionInputs.criterionNumber, 11)));
    }
  });

  await writeAudit({
    entityType: "Assessment",
    entityId: id,
    actor,
    action: `Relationship type overridden to ${newValue} — "${reason}"`,
    beforeValue: assessment.relationshipType,
    afterValue: newValue,
  });

  const [updated] = await db.select().from(assessments).where(eq(assessments.id, id));
  return c.json(updated);
});

assessmentsRoute.post("/:id/submit", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ error: "Missing actor" }, 400);
  const id = c.req.param("id");

  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, id));
  if (!assessment) return c.json({ ok: false, reason: "Assessment not found." }, 404);
  if (assessment.state !== "Draft") return c.json({ ok: false, reason: "Only a Draft assessment can be submitted." }, 409);

  const guard = canSubmit(assessment, actor);
  if (!guard.ok) return c.json(guard, 403);

  const [rating] = await db.select().from(ratings).where(and(eq(ratings.assessmentId, id), isNull(ratings.supersededAt)));
  if (!rating) return c.json({ ok: false, reason: "A computed rating is required before submission (FR7.2) — complete every review item first." }, 409);

  const now = nowDate();
  await db.update(assessments).set({ state: "Submitted", submittedBy: actor, submittedAt: now }).where(eq(assessments.id, id));
  await writeAudit({ entityType: "Assessment", entityId: id, actor, action: "Submitted for approval", beforeValue: "Draft", afterValue: "Submitted" });

  return c.json({ ok: true });
});

const decisionSchema = z.object({ action: z.enum(["Approve", "Reject", "Return"]), comments: z.string().trim().default("") });

assessmentsRoute.post("/:id/decision", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ error: "Missing actor" }, 400);
  const id = c.req.param("id");

  const parsed = decisionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, reason: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const { action, comments } = parsed.data;

  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, id));
  if (!assessment) return c.json({ ok: false, reason: "Assessment not found." }, 404);
  if (assessment.state !== "Submitted") return c.json({ ok: false, reason: "Only a Submitted assessment can be decided." }, 409);

  if (action === "Reject" && !comments.trim()) return c.json({ ok: false, reason: "A reason is required to reject." }, 400);
  if (action === "Return" && !comments.trim()) return c.json({ ok: false, reason: "Comments are required when returning for revision." }, 400);

  const guard = action === "Return" ? canReturn(assessment, actor) : canApprove(assessment, actor);
  if (!guard.ok) return c.json(guard, 403);

  const nextState = action === "Approve" ? "Approved" : action === "Reject" ? "Rejected" : "Draft";

  await db.transaction(async (tx) => {
    await tx.insert(approvalDecisions).values({ id: nextId("dec"), assessmentId: id, actor, action, comments, policyVersion: POLICY_VERSION });
    await tx.update(assessments).set({ state: nextState }).where(eq(assessments.id, id));
  });

  await writeAudit({
    entityType: "Assessment",
    entityId: id,
    actor,
    action: `Approval decision: ${action}`,
    beforeValue: "Submitted",
    afterValue: action === "Return" ? "Draft (returned for revision)" : nextState,
  });

  return c.json({ ok: true });
});

export default assessmentsRoute;
