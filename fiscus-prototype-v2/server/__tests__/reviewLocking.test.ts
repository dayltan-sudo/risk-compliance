import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./testDb.js";
import { call, seedAssessment } from "./fixtures.js";
import { criterionInputs, extractedFields } from "../db/schema.js";

// P0 #1 — a Submitted/Approved/Rejected assessment must not change underneath
// the approver.
describe.each(["Submitted", "Approved", "Rejected"] as const)("%s assessment is read-only", (state) => {
  it("rejects field confirm/amend and leaves the value untouched", async () => {
    await seedAssessment({ id: "a1", state });
    const fieldId = "f-a1-FY2026-Sales";
    await db.update(extractedFields).set({ status: "Unconfirmed" }).where(eq(extractedFields.id, fieldId));

    const confirm = await call("POST", `/fields/${fieldId}/confirm`, {});
    const amend = await call("POST", `/fields/${fieldId}/amend`, { value: 5, reason: "x" });

    expect(confirm.status).toBe(409);
    expect(amend.status).toBe(409);
    const [row] = await db.select().from(extractedFields).where(eq(extractedFields.id, fieldId));
    expect(row.value).toBe(1000);
    expect(row.status).toBe("Unconfirmed");
  });

  it("rejects bulk-confirm", async () => {
    await seedAssessment({ id: "a1", state });
    const res = await call("POST", "/assessments/a1/bulk-confirm-high", {});
    expect(res.status).toBe(409);
    const rows = await db.select().from(extractedFields).where(eq(extractedFields.status, "Confirmed"));
    expect(rows).toHaveLength(0);
  });

  it("rejects criterion confirm/amend", async () => {
    await seedAssessment({ id: "a1", state });
    await db.update(criterionInputs).set({ status: "Unconfirmed" }).where(eq(criterionInputs.id, "crit-a1-7"));

    const confirm = await call("POST", "/assessments/a1/criteria/7/confirm", { yearRegisteredSg: 2001 });
    const amend = await call("POST", "/assessments/a1/criteria/9/amend", { changeInDirectors: true, reason: "x" });

    expect(confirm.status).toBe(409);
    expect(amend.status).toBe(409);
    const [c7] = await db.select().from(criterionInputs).where(eq(criterionInputs.id, "crit-a1-7"));
    expect(c7.yearRegisteredSg).toBeNull();
    expect(c7.status).toBe("Unconfirmed");
  });

  it("rejects a relationship-type override", async () => {
    await seedAssessment({ id: "a1", state });
    const res = await call("PATCH", "/assessments/a1/relationship-type", { newValue: "New", reason: "because" });
    expect(res.status).toBe(409);
  });
});

it("still allows edits on a Draft", async () => {
  await seedAssessment({ id: "a1" });
  const res = await call("POST", "/fields/f-a1-FY2026-Sales/confirm", {});
  expect(res.status).toBe(200);
});
