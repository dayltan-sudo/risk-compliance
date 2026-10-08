import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./testDb.js";
import { call, callRaw, seedAssessment } from "./fixtures.js";
import { criterionInputs, extractedFields } from "../db/schema.js";

async function unconfirm(criterionId: string, patch: Partial<typeof criterionInputs.$inferInsert> = {}) {
  await db.update(criterionInputs).set({ status: "Unconfirmed", ...patch }).where(eq(criterionInputs.id, criterionId));
}

// P0 #2 — blank / zero inputs must never be saved as real values.
describe("criterion 7 year registered", () => {
  it.each([
    ["blank (null)", null],
    ["zero", 0],
    ["before 1800", 1799],
    ["after the assessment year", 2027],
    ["non-integer", 2010.5],
  ])("rejects %s with 400", async (_label, year) => {
    await seedAssessment({ id: "a1" });
    const res = await call("POST", "/assessments/a1/criteria/7/confirm", { yearRegisteredSg: year });
    expect(res.status).toBe(400);
    const [row] = await db.select().from(criterionInputs).where(eq(criterionInputs.id, "crit-a1-7"));
    expect(row.status).toBe("Unconfirmed");
    expect(row.yearRegisteredSg).toBeNull();
  });

  it("rejects amend to 0 and keeps the old year", async () => {
    await seedAssessment({ id: "a1", reviewed: true });
    const res = await call("POST", "/assessments/a1/criteria/7/amend", { yearRegisteredSg: 0, reason: "typo" });
    expect(res.status).toBe(400);
    const [row] = await db.select().from(criterionInputs).where(eq(criterionInputs.id, "crit-a1-7"));
    expect(row.yearRegisteredSg).toBe(2005);
  });

  it("accepts the boundary years", async () => {
    await seedAssessment({ id: "a1" });
    expect((await call("POST", "/assessments/a1/criteria/7/confirm", { yearRegisteredSg: 2026 })).status).toBe(200);
  });
});

describe("criterion 5 paid-up capital / exposure", () => {
  const valid = { paidUpCapital: 100, totalExposure: 50, currency: "SGD" };

  it.each([
    ["zero paid-up capital", { ...valid, paidUpCapital: 0 }],
    ["negative paid-up capital", { ...valid, paidUpCapital: -5 }],
    ["blank paid-up capital", { ...valid, paidUpCapital: null }],
    ["zero exposure", { ...valid, totalExposure: 0 }],
    ["missing currency", { ...valid, currency: "" }],
  ])("rejects %s", async (_label, body) => {
    await seedAssessment({ id: "a1" });
    const res = await call("POST", "/assessments/a1/criteria/5/confirm", body);
    expect(res.status).toBe(400);
  });

  it("normalises currency to upper case", async () => {
    await seedAssessment({ id: "a1" });
    expect((await call("POST", "/assessments/a1/criteria/5/confirm", { ...valid, currency: " sgd " })).status).toBe(200);
    const [row] = await db.select().from(criterionInputs).where(eq(criterionInputs.id, "crit-a1-5"));
    expect(row.currency).toBe("SGD");
  });
});

describe("field amend", () => {
  it("rejects a non-finite number (1e999 parses to Infinity)", async () => {
    await seedAssessment({ id: "a1", reviewed: true });
    const res = await callRaw("POST", "/fields/f-a1-FY2026-Sales/amend", '{"value": 1e999, "reason": "x"}');
    expect(res.status).toBe(400);
    const [row] = await db.select().from(extractedFields).where(eq(extractedFields.id, "f-a1-FY2026-Sales"));
    expect(row.value).toBe(1000);
  });

  it("rejects a string value (what Number('') used to be coerced from)", async () => {
    await seedAssessment({ id: "a1", reviewed: true });
    expect((await call("POST", "/fields/f-a1-FY2026-Sales/amend", { value: "", reason: "x" })).status).toBe(400);
  });
});

// P0 #4 — FR5.6: the prefilled paid-up capital's currency can't be relabelled.
describe("criterion 5 currency match (FR5.6)", () => {
  it("rejects relabelling a prefilled USD figure as SGD", async () => {
    await seedAssessment({ id: "a1" });
    await unconfirm("crit-a1-5", { paidUpCapital: 2_000_000, currency: "USD", source: "registry" });
    const res = await call("POST", "/assessments/a1/criteria/5/confirm", { paidUpCapital: 2_000_000, totalExposure: 50, currency: "SGD" });
    expect(res.status).toBe(400);
    expect(String(res.body?.reason)).toContain("FR5.6");
  });

  it("accepts the same figure in its own currency", async () => {
    await seedAssessment({ id: "a1" });
    await unconfirm("crit-a1-5", { paidUpCapital: 2_000_000, currency: "USD", source: "registry" });
    const res = await call("POST", "/assessments/a1/criteria/5/confirm", { paidUpCapital: 2_000_000, totalExposure: 50, currency: "USD" });
    expect(res.status).toBe(200);
  });

  it("accepts a different currency when the figure is re-entered too", async () => {
    await seedAssessment({ id: "a1" });
    await unconfirm("crit-a1-5", { paidUpCapital: 2_000_000, currency: "USD", source: "registry" });
    const res = await call("POST", "/assessments/a1/criteria/5/confirm", { paidUpCapital: 2_700_000, totalExposure: 50, currency: "SGD" });
    expect(res.status).toBe(200);
  });
});
