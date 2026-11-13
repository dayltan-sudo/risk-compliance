import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "./testDb.js";
import { call, seedAssessment } from "./fixtures.js";
import { integrityCheckResults } from "../db/schema.js";

async function taCheck(assessmentId: string) {
  const rows = await db
    .select()
    .from(integrityCheckResults)
    .where(and(eq(integrityCheckResults.assessmentId, assessmentId), eq(integrityCheckResults.checkName, "total_assets_eq_ca_plus_nca"), eq(integrityCheckResults.period, "FY2026")));
  return rows[0];
}

// P0 #7 — integrity checks read field values, so any change to a value must rerun them.
describe("integrity checks rerun after field changes", () => {
  it("amend: Total Assets 1000 -> 1200 flips the equality check to Fail", async () => {
    await seedAssessment({ id: "a1", scored: true });
    expect((await taCheck("a1"))?.passed).toBe(true);

    const res = await call("POST", "/fields/f-a1-FY2026-Total Assets/amend", { value: 1200, reason: "restated" });
    expect(res.status).toBe(200);

    const after = await taCheck("a1");
    expect(after?.passed).toBe(false);
    expect(after?.expected).toBe(1000);
    expect(after?.actual).toBe(1200);
  });

  it("confirm with a corrected value reruns the checks", async () => {
    await seedAssessment({ id: "a1" });
    await call("POST", "/fields/f-a1-FY2026-Sales/confirm", {}); // seeds the check set
    expect((await taCheck("a1"))?.passed).toBe(true);

    const res = await call("POST", "/fields/f-a1-FY2026-Total Assets/confirm", { value: 1200 });
    expect(res.status).toBe(200);
    expect((await taCheck("a1"))?.passed).toBe(false);
  });

  it("bulk-confirm reruns the checks", async () => {
    await seedAssessment({ id: "a1" });
    expect(await taCheck("a1")).toBeUndefined();

    const res = await call("POST", "/assessments/a1/bulk-confirm-high", {});
    expect(res.status).toBe(200);
    expect((await taCheck("a1"))?.passed).toBe(true);
  });
});
