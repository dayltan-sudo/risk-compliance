import { describe, it, expect } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./testDb.js";
import { call, liveRating, seedAssessment } from "./fixtures.js";
import { assessments, criterionInputs, ratings, ratios, riskCommentaries } from "../db/schema.js";

async function state(id: string) {
  return (await db.select().from(assessments).where(eq(assessments.id, id)))[0].state;
}

// P0 #5 — submit must re-verify the review gate and the rating's weight set.
describe("submit gate", () => {
  it("submits a fully reviewed, correctly weighted assessment", async () => {
    await seedAssessment({ id: "a1", scored: true });
    expect((await liveRating("a1"))).toHaveLength(1);
    const res = await call("POST", "/assessments/a1/submit", {});
    expect(res.status).toBe(200);
    expect(await state("a1")).toBe("Submitted");
  });

  it("refuses when no rating exists", async () => {
    await seedAssessment({ id: "a1", reviewed: true });
    expect((await call("POST", "/assessments/a1/submit", {})).status).toBe(409);
  });

  it("refuses when a criterion is Unconfirmed even though a rating is still live", async () => {
    await seedAssessment({ id: "a1", scored: true });
    await db.update(criterionInputs).set({ status: "Unconfirmed" }).where(eq(criterionInputs.id, "crit-a1-11"));
    expect(await liveRating("a1")).toHaveLength(1); // the stale rating that used to be enough

    const res = await call("POST", "/assessments/a1/submit", {});
    expect(res.status).toBe(409);
    expect(await state("a1")).toBe("Draft");
  });

  it("refuses when the live rating's weight set doesn't match the relationship type", async () => {
    await seedAssessment({ id: "a1", scored: true, relationshipType: "Renewal" });
    await db.update(ratings).set({ weightSet: "new" }).where(eq(ratings.assessmentId, "a1"));

    const res = await call("POST", "/assessments/a1/submit", {});
    expect(res.status).toBe(409);
    expect(String(res.body?.reason)).toMatch(/weights/i);
    expect(await state("a1")).toBe("Draft");
  });
});

// P0 #6 — changing the relationship type changes the weight set, so it must rescore.
describe("relationship-type override", () => {
  it("rescores with the new weight set when the review gate still holds (Renewal -> New)", async () => {
    await seedAssessment({ id: "a1", scored: true, relationshipType: "Renewal" });
    expect((await liveRating("a1"))[0].weightSet).toBe("renewal");

    const res = await call("PATCH", "/assessments/a1/relationship-type", { newValue: "New", reason: "first contract" });
    expect(res.status).toBe(200);

    const live = await liveRating("a1");
    expect(live).toHaveLength(1);
    expect(live[0].weightSet).toBe("new");
    expect((await call("POST", "/assessments/a1/submit", {})).status).toBe(200);
  });

  it("retires every live result when the override reopens the gate (New -> Renewal resets criterion 11)", async () => {
    await seedAssessment({ id: "a1", scored: true, relationshipType: "New" });
    expect(await liveRating("a1")).toHaveLength(1);

    const res = await call("PATCH", "/assessments/a1/relationship-type", { newValue: "Renewal", reason: "repeat customer" });
    expect(res.status).toBe(200);

    expect(await liveRating("a1")).toHaveLength(0);
    expect(await db.select().from(ratios).where(and(eq(ratios.assessmentId, "a1"), isNull(ratios.supersededAt)))).toHaveLength(0);
    expect(await db.select().from(riskCommentaries).where(and(eq(riskCommentaries.assessmentId, "a1"), isNull(riskCommentaries.supersededAt)))).toHaveLength(0);
    // superseded, not deleted
    expect((await db.select().from(ratings).where(eq(ratings.assessmentId, "a1"))).length).toBeGreaterThan(0);

    expect((await call("POST", "/assessments/a1/submit", {})).status).toBe(409);
  });

  it("is a no-op when the type is unchanged", async () => {
    await seedAssessment({ id: "a1", scored: true, relationshipType: "Renewal" });
    const before = await liveRating("a1");
    await call("PATCH", "/assessments/a1/relationship-type", { newValue: "Renewal", reason: "same" });
    expect((await liveRating("a1")).map((r) => r.id)).toEqual(before.map((r) => r.id));
  });
});
