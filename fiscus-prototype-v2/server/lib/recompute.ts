import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { assessments, extractedFields, criterionInputs, integrityCheckResults, ratios, ratings, riskCommentaries, documents } from "../db/schema.js";
import { computeRatios } from "../../src/engine/ratios.js";
import { computeRating } from "../../src/engine/rating.js";
import { computeIntegrityChecks } from "../../src/engine/integrityChecks.js";
import { generateRiskCommentaryLLM } from "./riskCommentaryLLM.js";
import { reviewComplete } from "../../src/store/selectors.js";
import { nextId, nowDate } from "./ids.js";
import { RECENCY_THRESHOLD_DAYS } from "../../src/data/config.js";
import { asExtractedFields, asCriterionInputs } from "./rowMappers.js";

/** Field Review.md Flow C — runs right after a period's field skeleton
 * exists, independent of review completion. Recomputed wholesale for the
 * assessment each time (matches useStore.ts's runIntegrityChecksAndRecency —
 * not a versioned/dated append, the live check set is simply replaced). */
export async function runIntegrityChecksAndRecency(assessmentId: string) {
  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
  if (!assessment || assessment.periods.length === 0) return;

  const fields = asExtractedFields(await db.select().from(extractedFields).where(eq(extractedFields.assessmentId, assessmentId)));
  const currentPeriod = assessment.periods[assessment.periods.length - 1];
  const priorPeriod = assessment.periods[0];
  const now = nowDate();

  const checks = computeIntegrityChecks(assessmentId, fields, assessment.periods, currentPeriod, priorPeriod, now).map((chk) => ({ ...chk, id: nextId("check") }));

  const [latestDoc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.assessmentId, assessmentId), eq(documents.period, currentPeriod)));

  let recencyFlag = assessment.recencyFlag;
  if (latestDoc?.financialsDate) {
    const daysSince = (Date.now() - new Date(latestDoc.financialsDate).getTime()) / (1000 * 60 * 60 * 24);
    recencyFlag = daysSince > RECENCY_THRESHOLD_DAYS ? "Non-Recent" : "Recent";
  }

  await db.transaction(async (tx) => {
    await tx.delete(integrityCheckResults).where(eq(integrityCheckResults.assessmentId, assessmentId));
    if (checks.length) await tx.insert(integrityCheckResults).values(checks);
    await tx.update(assessments).set({ recencyFlag }).where(eq(assessments.id, assessmentId));
  });
}

/** FR3.8/FR4.8 — the hard compute gate, then the full recompute cascade:
 * ratios -> rating -> risk commentary (regenerate-and-supersede, FR11.7).
 * Called after every confirm/amend/bulk-confirm/upload/relationship-type
 * change. No-ops silently while the gate doesn't hold, exactly like
 * useStore.ts's checkReviewCompleteAndRecompute. */
export async function checkReviewCompleteAndRecompute(assessmentId: string) {
  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
  if (!assessment) return;

  const [rawFields, rawCriteria] = await Promise.all([
    db.select().from(extractedFields).where(eq(extractedFields.assessmentId, assessmentId)),
    db.select().from(criterionInputs).where(eq(criterionInputs.assessmentId, assessmentId)),
  ]);
  const allFields = asExtractedFields(rawFields);
  const allCriteria = asCriterionInputs(rawCriteria);

  if (!reviewComplete(allFields, allCriteria, assessment)) return;
  if (assessment.periods.length < 2) return;

  const now = nowDate();
  const currentPeriod = assessment.periods[assessment.periods.length - 1];
  const priorPeriod = assessment.periods[0];

  const confirmedFields = allFields.filter((f) => f.status !== "Unconfirmed");
  const confirmedCriteria = allCriteria.filter((c) => c.status !== "Unconfirmed");

  const newRatios = computeRatios(assessmentId, confirmedFields, confirmedCriteria, currentPeriod, priorPeriod, assessment.assessmentYear, now).map((r) => ({
    ...r,
    id: nextId("ratio"),
  }));
  const rating = { ...computeRating(assessmentId, newRatios, confirmedCriteria, confirmedFields, currentPeriod, assessment.relationshipType, now), id: nextId("rating") };

  // FR11 — real LLM call (DeepSeek V4.1 Flash via OpenCode Go). Never blocks
  // the Ratio/Rating writes below on failure — see riskCommentaryLLM.ts.
  const commentary = await generateRiskCommentaryLLM(assessmentId, rating.id, rating, newRatios, confirmedFields, confirmedCriteria, now);

  await db.transaction(async (tx) => {
    // FR4.10/FR6.12 — a rescore supersedes, never deletes, a prior Ratio or
    // Rating (same discipline as risk_commentaries' own supersededAt).
    // Required, not just for audit parity: risk_commentaries.rating_id FKs to
    // ratings.id, and a superseded RiskCommentary (retained per FR11.7) keeps
    // pointing at the Rating it was generated from — hard-deleting that
    // Rating would violate the FK on this assessment's second rescore.
    await tx
      .update(ratios)
      .set({ supersededAt: now })
      .where(and(eq(ratios.assessmentId, assessmentId), isNull(ratios.supersededAt)));
    if (newRatios.length) await tx.insert(ratios).values(newRatios);

    await tx
      .update(ratings)
      .set({ supersededAt: now })
      .where(and(eq(ratings.assessmentId, assessmentId), isNull(ratings.supersededAt)));
    await tx.insert(ratings).values(rating);

    await tx
      .update(riskCommentaries)
      .set({ supersededAt: now })
      .where(and(eq(riskCommentaries.assessmentId, assessmentId), isNull(riskCommentaries.supersededAt)));
    await tx.insert(riskCommentaries).values({ ...commentary, id: nextId("commentary") });
  });
}
