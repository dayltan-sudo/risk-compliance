import { describe, expect, it } from "vitest";
import { computeRatios, fieldPeriodChange } from "../ratios.js";
import { criterionInput, fieldsForPeriod, NOW } from "./fixtures.js";

const PRIOR = "FY2024";
const CURRENT = "FY2025";

describe("fieldPeriodChange (FR4.6)", () => {
  it("computes (current - prior) / prior", () => {
    const fields = [...fieldsForPeriod(PRIOR, { Sales: 100 }), ...fieldsForPeriod(CURRENT, { Sales: 150 })];
    expect(fieldPeriodChange(fields, "Sales", CURRENT, PRIOR)).toBeCloseTo(0.5);
  });

  it("is null (never a fabricated 0) when the prior value is zero", () => {
    const fields = [...fieldsForPeriod(PRIOR, { Sales: 0 }), ...fieldsForPeriod(CURRENT, { Sales: 150 })];
    expect(fieldPeriodChange(fields, "Sales", CURRENT, PRIOR)).toBeNull();
  });

  it("is null when the prior value is absent", () => {
    const fields = [...fieldsForPeriod(PRIOR, { Sales: null }), ...fieldsForPeriod(CURRENT, { Sales: 150 })];
    expect(fieldPeriodChange(fields, "Sales", CURRENT, PRIOR)).toBeNull();
  });
});

describe("computeRatios — not-calculable vs. zero-divisor (FR4.7/FR4.11)", () => {
  it("an absent required field renders not-calculable, never a substituted zero", () => {
    const fields = [
      ...fieldsForPeriod(PRIOR, {}),
      ...fieldsForPeriod(CURRENT, { "Current Assets": 100_000, "Current Liabilities": null }),
    ];
    const ratios = computeRatios("a-test", fields, [], CURRENT, PRIOR, 2026, NOW);
    const currentRatio = ratios.find((r) => r.ratioKey === "current_ratio" && r.period === CURRENT)!;
    expect(currentRatio.valueNumeric).toBeNull();
    expect(currentRatio.notCalculableReason).toContain("Current Liabilities");
    expect(currentRatio.zeroDivisorField).toBeNull();
  });

  it("a zero divisor is distinct from an absent input — current liabilities = 0", () => {
    const fields = [
      ...fieldsForPeriod(PRIOR, {}),
      ...fieldsForPeriod(CURRENT, { "Current Assets": 100_000, "Current Liabilities": 0 }),
    ];
    const ratios = computeRatios("a-test", fields, [], CURRENT, PRIOR, 2026, NOW);
    const currentRatio = ratios.find((r) => r.ratioKey === "current_ratio" && r.period === CURRENT)!;
    expect(currentRatio.notCalculableReason).toBeNull();
    expect(currentRatio.zeroDivisorField).toBe("Current Liabilities");
    expect(currentRatio.zeroDivisorTierApplied).toBe(3);
  });
});

describe("criterion 5 (paid-up capital cover) reads CriterionInput, not ExtractedField", () => {
  it("computes the cover ratio from the two confirmed amounts", () => {
    const ratios = computeRatios("a-test", [], [criterionInput(5, { paidUpCapital: 1_000_000, totalExposure: 500_000 })], CURRENT, PRIOR, 2026, NOW);
    const cover = ratios.find((r) => r.ratioKey === "paid_up_capital_cover")!;
    expect(cover.valueNumeric).toBe(2);
  });

  it("is not-calculable when criterion 5 has no confirmed row", () => {
    const ratios = computeRatios("a-test", [], [], CURRENT, PRIOR, 2026, NOW);
    const cover = ratios.find((r) => r.ratioKey === "paid_up_capital_cover")!;
    expect(cover.valueNumeric).toBeNull();
    expect(cover.notCalculableReason).not.toBeNull();
  });
});

describe("criterion 7 (years established) reads assessment_year from the caller, never a literal (corrects D108)", () => {
  it("subtracts yearRegisteredSg from the passed-in assessmentYear", () => {
    const ratios = computeRatios("a-test", [], [criterionInput(7, { yearRegisteredSg: 2015 })], CURRENT, PRIOR, 2030, NOW);
    const years = ratios.find((r) => r.ratioKey === "years_established")!;
    expect(years.valueNumeric).toBe(15);
  });
});
