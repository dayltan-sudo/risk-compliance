import { describe, expect, it } from "vitest";
import { computeIntegrityChecks } from "../integrityChecks.js";
import { fieldsForPeriod, NOW } from "./fixtures.js";

const PRIOR = "FY2024";
const CURRENT = "FY2025";

describe("inequality checks (FR3.7)", () => {
  it("passes when NPAT <= Sales", () => {
    const fields = fieldsForPeriod(CURRENT, { NPAT: 50, Sales: 100 });
    const results = computeIntegrityChecks("a-test", fields, [CURRENT], CURRENT, PRIOR, NOW);
    expect(results.find((r) => r.checkName === "npat_le_sales")!.passed).toBe(true);
  });

  it("fails when NPAT > Sales", () => {
    const fields = fieldsForPeriod(CURRENT, { NPAT: 150, Sales: 100 });
    const results = computeIntegrityChecks("a-test", fields, [CURRENT], CURRENT, PRIOR, NOW);
    const r = results.find((c) => c.checkName === "npat_le_sales")!;
    expect(r.passed).toBe(false);
    expect(r.difference).toBe(100 - 150); // signed expected - actual (FR3.13)
  });

  it("is not evaluated when an operand has no live value yet", () => {
    const fields = fieldsForPeriod(CURRENT, { NPAT: 50 }); // Sales absent
    const results = computeIntegrityChecks("a-test", fields, [CURRENT], CURRENT, PRIOR, NOW);
    expect(results.find((r) => r.checkName === "npat_le_sales")).toBeUndefined();
  });
});

describe("equality checks with 0.1% relative tolerance (FR3.7, corrects the workbook's unworkable absolute ±1)", () => {
  it("passes exactly at the tolerance boundary", () => {
    const totalAssets = 1_000_000;
    const sumParts = totalAssets * 1.001; // exactly 0.1% over
    const fields = fieldsForPeriod(CURRENT, { "Total Assets": totalAssets, "Current Assets": sumParts, "Non-Current Assets": 0 });
    const results = computeIntegrityChecks("a-test", fields, [CURRENT], CURRENT, PRIOR, NOW);
    expect(results.find((r) => r.checkName === "total_assets_eq_ca_plus_nca")!.passed).toBe(true);
  });

  it("fails just beyond the tolerance boundary", () => {
    const totalAssets = 1_000_000;
    const sumParts = totalAssets * 1.002; // beyond 0.1%
    const fields = fieldsForPeriod(CURRENT, { "Total Assets": totalAssets, "Current Assets": sumParts, "Non-Current Assets": 0 });
    const results = computeIntegrityChecks("a-test", fields, [CURRENT], CURRENT, PRIOR, NOW);
    const r = results.find((c) => c.checkName === "total_assets_eq_ca_plus_nca")!;
    expect(r.passed).toBe(false);
    expect(r.toleranceApplied).toBeCloseTo(1_000);
  });
});

describe("FR3.13 discrepancy attribution — ranks a failed check's operands by movement, largest first", () => {
  it("ranks the operand that moved most period-over-period first, and excludes one with no prior value", () => {
    const fields = [
      ...fieldsForPeriod(PRIOR, { "Current Assets": 100_000, "Total Assets": 1_000_000 }), // Non-Current Assets has no prior -> excluded, not defaulted to last
      ...fieldsForPeriod(CURRENT, { "Current Assets": 400_000, "Non-Current Assets": 210_000, "Total Assets": 500_000 }), // fails: CA+NCA=610,000 != 500,000
    ];
    const results = computeIntegrityChecks("a-test", fields, [CURRENT], CURRENT, PRIOR, NOW);
    const r = results.find((c) => c.checkName === "total_assets_eq_ca_plus_nca")!;
    expect(r.passed).toBe(false);
    // Current Assets moved 300% ((400k-100k)/100k), Total Assets moved -50%
    // ((500k-1,000k)/1,000k); Non-Current Assets has no prior figure and must
    // be excluded rather than ranked last with a fabricated 0% change.
    expect(r.operandMovementRanking).not.toBeNull();
    expect(r.operandMovementRanking!.map((m) => m.fieldName)).toEqual(["Current Assets", "Total Assets"]);
  });
});
