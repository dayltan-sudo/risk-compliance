import { describe, expect, it } from "vitest";
import { computeRatios } from "../ratios.js";
import { computeRating } from "../rating.js";
import { criterionInput, fieldsForPeriod, NOW } from "./fixtures.js";
import type { CriterionInput, ExtractedField, RelationshipType } from "../../types.js";

// Parity harness for FR6/Baseline_Scorecard_Extract_v1.2.md §3/§7.
//
// LIMITATION: the client's source workbook (`Credit Review Report
// template.xlsx`) is not in this repo, and no worked numeric example ships
// with Baseline_Scorecard_Extract_v1.2.md — so this cannot yet be a literal
// "same inputs, same output as the .xlsx" regression test (NFR
// Reproducibility). What it does verify: the engine reproduces the *written*
// methodology in the extract exactly, including the six corrections listed
// in its §7 (each defect the workbook itself had, and the fixed behaviour
// this spec requires instead). If the real workbook or a client-supplied
// worked example ever becomes available, add it as a fixture here and this
// file becomes true workbook parity rather than spec parity.

const PRIOR = "FY2024";
const CURRENT = "FY2025";

function rate(
  fields: ExtractedField[],
  inputs: CriterionInput[],
  relationshipType: RelationshipType,
  assessmentYear = 2034,
) {
  const ratios = computeRatios("a-test", fields, inputs, CURRENT, PRIOR, assessmentYear, NOW);
  return computeRating("a-test", ratios, inputs, fields, CURRENT, relationshipType, NOW);
}

function driver(rating: ReturnType<typeof rate>, n: number) {
  return rating.driverBreakdown.find((d) => d.criterionNumber === n)!;
}

// A fixture where every one of the eleven criteria lands exactly on its
// tier-3 boundary (FR6.7's "closed on one side" bands) — assessmentYear=2034,
// yearRegisteredSg=2024 gives exactly 10 years established.
function allTier3Fixture() {
  const fields = [
    ...fieldsForPeriod(PRIOR, { NPAT: 100_000 }),
    ...fieldsForPeriod(CURRENT, {
      Sales: 2_000_000,
      NPAT: 600_000, // NPM = 30% exactly
      "Current Assets": 600_000,
      "Current Liabilities": 200_000, // current ratio = 3 exactly; WC/Sales = 400,000/2,000,000 = 20% exactly
      "Total Liabilities": 500_000,
      "Total Equity": 500_000, // D/E = 1 exactly
      "Net Operating Cash Flow Positive": true,
    }),
  ];
  const inputs = [
    criterionInput(5, { paidUpCapital: 1_000_000, totalExposure: 500_000 }), // cover = 2x exactly
    criterionInput(7, { yearRegisteredSg: 2024 }), // 2034 - 2024 = 10 exactly
    criterionInput(8, { litigationRecord: "Clean" }),
    criterionInput(9, { changeInDirectors: false }),
    criterionInput(11, { promptPaymentRecord: "Good" }),
  ];
  return { fields, inputs };
}

// A fixture where every criterion lands in tier 1.
function allTier1Fixture() {
  const fields = [
    ...fieldsForPeriod(PRIOR, { NPAT: -10_000 }),
    ...fieldsForPeriod(CURRENT, {
      Sales: 1_000_000,
      NPAT: -50_000, // NPM negative
      "Current Assets": 100_000,
      "Current Liabilities": 200_000, // current ratio 0.5; WC/Sales negative
      "Total Liabilities": 900_000,
      "Total Equity": 100_000, // D/E = 9, high leverage
      "Net Operating Cash Flow Positive": false,
    }),
  ];
  const inputs = [
    criterionInput(5, { paidUpCapital: 50_000, totalExposure: 500_000 }), // cover 0.1x
    criterionInput(7, { yearRegisteredSg: 2031 }), // 3 years established
    criterionInput(8, { litigationRecord: "Other record" }),
    criterionInput(9, { changeInDirectors: true }),
    criterionInput(11, { promptPaymentRecord: "None held" }),
  ];
  return { fields, inputs };
}

describe("all criteria at tier 3 (FR6.1, FR6.7 boundaries)", () => {
  it.each<RelationshipType>(["New", "Renewal"])("composite is 300 and class A for %s", (relationshipType) => {
    const { fields, inputs } = allTier3Fixture();
    const rating = rate(fields, inputs, relationshipType);
    for (let n = 1; n <= 11; n++) {
      if (n === 11 && relationshipType === "New") continue; // weight 0 — tier is a sentinel, never contributes
      expect(driver(rating, n).tier, `criterion ${n}`).toBe(3);
    }
    expect(rating.compositeScore).toBe(300);
    expect(rating.ratingClass).toBe("A");
  });
});

describe("all criteria at tier 1", () => {
  it.each<RelationshipType>(["New", "Renewal"])("composite is 100 and class C for %s", (relationshipType) => {
    const { fields, inputs } = allTier1Fixture();
    const rating = rate(fields, inputs, relationshipType);
    for (let n = 1; n <= 11; n++) {
      expect(driver(rating, n).tier, `criterion ${n}`).toBe(1);
    }
    expect(rating.compositeScore).toBe(100);
    expect(rating.ratingClass).toBe("C");
  });
});

describe("§7 corrections — band boundaries the baseline workbook got wrong", () => {
  it("current ratio of exactly 2 is tier 2, not tier 1 (corrects N88)", () => {
    const { inputs } = allTier3Fixture();
    const fields = [
      ...fieldsForPeriod(PRIOR, { NPAT: 100_000 }),
      ...fieldsForPeriod(CURRENT, { Sales: 2_000_000, NPAT: 600_000, "Current Assets": 200_000, "Current Liabilities": 100_000, "Total Liabilities": 500_000, "Total Equity": 500_000, "Net Operating Cash Flow Positive": true }),
    ];
    const rating = rate(fields, inputs, "Renewal");
    expect(driver(rating, 2).tier).toBe(2);
  });

  it("WC over revenue of exactly 0% is tier 2, not tier 1 (corrects E85/N84's unreachable band)", () => {
    const { inputs } = allTier3Fixture();
    const fields = [
      ...fieldsForPeriod(PRIOR, { NPAT: 100_000 }),
      ...fieldsForPeriod(CURRENT, { Sales: 2_000_000, NPAT: 600_000, "Current Assets": 200_000, "Current Liabilities": 200_000, "Total Liabilities": 500_000, "Total Equity": 500_000, "Net Operating Cash Flow Positive": true }),
    ];
    const rating = rate(fields, inputs, "Renewal");
    expect(driver(rating, 1).tier).toBe(2);
  });

  it("assessment_year is read from the assessment record, never hardcoded 2023 (corrects D108)", () => {
    const { inputs } = allTier3Fixture();
    const fields = [
      ...fieldsForPeriod(PRIOR, { NPAT: 100_000 }),
      ...fieldsForPeriod(CURRENT, { Sales: 2_000_000, NPAT: 600_000, "Current Assets": 600_000, "Current Liabilities": 200_000, "Total Liabilities": 500_000, "Total Equity": 500_000, "Net Operating Cash Flow Positive": true }),
    ];
    // yearRegisteredSg=2024 with assessmentYear=2034 (fixture default) hits
    // tier 3 exactly; a hardcoded 2023 would instead read -11 years -> tier 1.
    const rating = rate(fields, inputs, "Renewal", 2034);
    expect(driver(rating, 7).tier).toBe(3);
    const stale = rate(fields, inputs, "Renewal", 2023);
    expect(driver(stale, 7).tier).toBe(1);
  });

  it("criterion 11 contributes an explicit 0 for New customers, never an unevaluated branch (corrects O121)", () => {
    const { fields, inputs } = allTier3Fixture();
    const rating = rate(fields, inputs, "New");
    const c11 = driver(rating, 11);
    expect(c11.weight).toBe(0);
    expect(c11.contribution).toBe(0);
  });
});

describe("debt-to-equity band shape (FR6.10) — three distinct tier-1 routes", () => {
  const base = () => ({
    inputs: allTier3Fixture().inputs,
    common: {
      Sales: 2_000_000, NPAT: 600_000, "Current Assets": 600_000, "Current Liabilities": 200_000,
      "Net Operating Cash Flow Positive": true,
    },
  });

  it("high leverage (D/E >= 2) -> tier 1, tierOneCondition high_leverage", () => {
    const { inputs, common } = base();
    const fields = [...fieldsForPeriod(PRIOR, { NPAT: 100_000 }), ...fieldsForPeriod(CURRENT, { ...common, "Total Liabilities": 1_000_000, "Total Equity": 500_000 })];
    const c4 = driver(rate(fields, inputs, "Renewal"), 4);
    expect(c4.tier).toBe(1);
    expect(c4.tierOneCondition).toBe("high_leverage");
  });

  it("negative equity (TE < 0) -> tier 1, tierOneCondition negative_equity", () => {
    const { inputs, common } = base();
    const fields = [...fieldsForPeriod(PRIOR, { NPAT: 100_000 }), ...fieldsForPeriod(CURRENT, { ...common, "Total Liabilities": 100_000, "Total Equity": -50_000 })];
    const c4 = driver(rate(fields, inputs, "Renewal"), 4);
    expect(c4.tier).toBe(1);
    expect(c4.tierOneCondition).toBe("negative_equity");
  });

  it("zero equity (TE = 0, a zero-divisor route per FR4.12) -> tier 1, tierOneCondition zero_equity", () => {
    const { inputs, common } = base();
    const fields = [...fieldsForPeriod(PRIOR, { NPAT: 100_000 }), ...fieldsForPeriod(CURRENT, { ...common, "Total Liabilities": 500_000, "Total Equity": 0 })];
    const c4 = driver(rate(fields, inputs, "Renewal"), 4);
    expect(c4.tier).toBe(1);
    expect(c4.tierOneCondition).toBe("zero_equity");
  });

  it("D/E just below 2 (1.99) is tier 2, not tier 1", () => {
    const { inputs, common } = base();
    const fields = [...fieldsForPeriod(PRIOR, { NPAT: 100_000 }), ...fieldsForPeriod(CURRENT, { ...common, "Total Liabilities": 199_000, "Total Equity": 100_000 })];
    const c4 = driver(rate(fields, inputs, "Renewal"), 4);
    expect(c4.tier).toBe(2);
  });
});

describe("zero-divisor rules (FR4.11/FR4.12) — not the same as an absent input", () => {
  it("zero current liabilities -> current ratio tier 3, the strongest possible liquidity", () => {
    const { inputs } = allTier3Fixture();
    const fields = [
      ...fieldsForPeriod(PRIOR, { NPAT: 100_000 }),
      ...fieldsForPeriod(CURRENT, { Sales: 2_000_000, NPAT: 600_000, "Current Assets": 600_000, "Current Liabilities": 0, "Total Liabilities": 500_000, "Total Equity": 500_000, "Net Operating Cash Flow Positive": true }),
    ];
    expect(driver(rate(fields, inputs, "Renewal"), 2).tier).toBe(3);
  });

  it("zero sales -> net profit margin and WC-over-revenue both tier 1", () => {
    const { inputs } = allTier3Fixture();
    const fields = [
      ...fieldsForPeriod(PRIOR, { NPAT: 100_000 }),
      ...fieldsForPeriod(CURRENT, { Sales: 0, NPAT: 600_000, "Current Assets": 600_000, "Current Liabilities": 200_000, "Total Liabilities": 500_000, "Total Equity": 500_000, "Net Operating Cash Flow Positive": true }),
    ];
    const rating = rate(fields, inputs, "Renewal");
    expect(driver(rating, 3).tier).toBe(1); // net profit margin
    expect(driver(rating, 1).tier).toBe(1); // WC over revenue
  });
});

describe("profitability history sign tiering (FR6.13) — recent performance dominates", () => {
  const common = { Sales: 2_000_000, "Current Assets": 600_000, "Current Liabilities": 200_000, "Total Liabilities": 500_000, "Total Equity": 500_000, "Net Operating Cash Flow Positive": true };
  const { inputs } = allTier3Fixture();

  it("both periods profitable -> tier 3", () => {
    const fields = [...fieldsForPeriod(PRIOR, { NPAT: 50_000 }), ...fieldsForPeriod(CURRENT, { ...common, NPAT: 600_000 })];
    expect(driver(rate(fields, inputs, "Renewal"), 6).tier).toBe(3);
  });

  it("latest profitable, prior a loss -> tier 2", () => {
    const fields = [...fieldsForPeriod(PRIOR, { NPAT: -50_000 }), ...fieldsForPeriod(CURRENT, { ...common, NPAT: 600_000 })];
    expect(driver(rate(fields, inputs, "Renewal"), 6).tier).toBe(2);
  });

  it("latest period a loss, whatever the prior did -> tier 1", () => {
    const fields = [...fieldsForPeriod(PRIOR, { NPAT: 500_000 }), ...fieldsForPeriod(CURRENT, { ...common, NPAT: -1 })];
    expect(driver(rate(fields, inputs, "Renewal"), 6).tier).toBe(1);
  });

  it("latest period's NPAT confirmed absent -> tier 1 via FR6.5, not FR6.13's sign logic", () => {
    const fields = [...fieldsForPeriod(PRIOR, { NPAT: 500_000 }), ...fieldsForPeriod(CURRENT, { ...common, NPAT: null })];
    expect(driver(rate(fields, inputs, "Renewal"), 6).tier).toBe(1);
  });
});

describe("absent inputs default to tier 1 (FR6.5), never a default clean record", () => {
  const { fields } = allTier3Fixture();

  it("criterion 7 with no CriterionInput row at all (Unconfirmed, filtered upstream)", () => {
    const inputs = [criterionInput(5, { paidUpCapital: 1_000_000, totalExposure: 500_000 }), criterionInput(8, { litigationRecord: "Clean" }), criterionInput(9, { changeInDirectors: false })];
    expect(driver(rate(fields, inputs, "Renewal"), 7).tier).toBe(1);
  });

  it("criterion 8 (litigation) with no row -> tier 1, not a clean record", () => {
    const inputs = [criterionInput(5, { paidUpCapital: 1_000_000, totalExposure: 500_000 }), criterionInput(7, { yearRegisteredSg: 2024 }), criterionInput(9, { changeInDirectors: false })];
    expect(driver(rate(fields, inputs, "Renewal"), 8).tier).toBe(1);
  });

  it("criterion 11 (prompt payment) with no row, Renewal -> tier 1, not the workbook's residual 'worst tier' default reinterpreted as clean", () => {
    const inputs = [criterionInput(5, { paidUpCapital: 1_000_000, totalExposure: 500_000 }), criterionInput(7, { yearRegisteredSg: 2024 }), criterionInput(8, { litigationRecord: "Clean" }), criterionInput(9, { changeInDirectors: false })];
    expect(driver(rate(fields, inputs, "Renewal"), 11).tier).toBe(1);
  });
});

describe("weight set selection (FR6.3) — only criteria 6, 7, 11 differ between New and Renewal", () => {
  it("matches the FR6.7 weight table", () => {
    const { fields, inputs } = allTier3Fixture();
    const renewal = rate(fields, inputs, "Renewal");
    const fresh = rate(fields, inputs, "New");
    expect(driver(renewal, 6).weight).toBe(15);
    expect(driver(fresh, 6).weight).toBe(25);
    expect(driver(renewal, 7).weight).toBe(5);
    expect(driver(fresh, 7).weight).toBe(10);
    expect(driver(renewal, 11).weight).toBe(15);
    expect(driver(fresh, 11).weight).toBe(0);
    for (const n of [1, 2, 3, 4, 5, 8, 9, 10]) {
      expect(driver(renewal, n).weight, `criterion ${n}`).toBe(driver(fresh, n).weight);
    }
  });
});

describe("rating class bands (FR6.8) — composite is always a multiple of 5, so these are the nearest reachable boundaries", () => {
  // Each step below moves exactly one criterion off tier 3 using a lever that
  // shares no field with any other criterion (FR2.2's field set couples
  // NPAT to both criterion 3 and 6, and Current Assets/Current Liabilities
  // to both criterion 1 and 2 — deliberately avoided here so each drop is
  // isolated and the arithmetic is exact).
  function withTiers(overrides: { 8?: "Other record"; 9?: boolean; 11?: "None held"; 5?: number; 2?: [number, number]; 4?: [number, number]; 10?: boolean }) {
    const { fields: base, inputs: baseInputs } = allTier3Fixture();
    const current = base.filter((f) => f.period === CURRENT);
    const prior = base.filter((f) => f.period === PRIOR);
    const patched = current.map((f) => {
      if (overrides[2] && f.fieldName === "Current Assets") return { ...f, value: overrides[2][0] };
      if (overrides[2] && f.fieldName === "Current Liabilities") return { ...f, value: overrides[2][1] };
      if (overrides[4] && f.fieldName === "Total Liabilities") return { ...f, value: overrides[4][0] };
      if (overrides[4] && f.fieldName === "Total Equity") return { ...f, value: overrides[4][1] };
      if (overrides[10] !== undefined && f.fieldName === "Net Operating Cash Flow Positive") return { ...f, value: overrides[10] };
      return f;
    });
    const inputs = baseInputs.map((i) => {
      if (overrides[8] && i.criterionNumber === 8) return { ...i, litigationRecord: overrides[8] };
      if (overrides[9] !== undefined && i.criterionNumber === 9) return { ...i, changeInDirectors: overrides[9] };
      if (overrides[11] && i.criterionNumber === 11) return { ...i, promptPaymentRecord: overrides[11] };
      if (overrides[5] !== undefined && i.criterionNumber === 5) return { ...i, totalExposure: overrides[5] };
      return i;
    });
    return { fields: [...prior, ...patched], inputs };
  }

  it("composite 240 — c8, c9, c11 to tier 1 (-20, -10, -30) is class A, the lower edge of the A band", () => {
    const { fields, inputs } = withTiers({ 8: "Other record", 9: true, 11: "None held" });
    const rating = rate(fields, inputs, "Renewal");
    expect(rating.compositeScore).toBe(240);
    expect(rating.ratingClass).toBe("A");
  });

  it("composite 235 — additionally c5 to tier 2 (-5) is one band-step short of 240, class B", () => {
    // paid-up capital 1,000,000 / exposure 666,667 =~ 1.5x -> tier 2
    const { fields, inputs } = withTiers({ 8: "Other record", 9: true, 11: "None held", 5: 666_667 });
    const rating = rate(fields, inputs, "Renewal");
    expect(rating.compositeScore).toBe(235);
    expect(rating.ratingClass).toBe("B");
  });

  it("composite 180 — additionally c2, c4, c10 to tier 1 (-20, -20, -20) is class B, the lower edge of the B band", () => {
    const { fields, inputs } = withTiers({ 8: "Other record", 9: true, 11: "None held", 2: [900_000, 500_000], 4: [1_000_000, 500_000], 10: false });
    const rating = rate(fields, inputs, "Renewal");
    // Current Assets = 900,000, Current Liabilities = 500,000: WC = 400,000,
    // WC/Sales = 20% exactly (criterion 1 stays tier 3); CA/CL = 1.8 < 2
    // (criterion 2 tier 1).
    expect(driver(rating, 1).tier).toBe(3);
    expect(driver(rating, 2).tier).toBe(1);
    expect(rating.compositeScore).toBe(180);
    expect(rating.ratingClass).toBe("B");
  });

  it("composite 175 — additionally c5 to tier 2 (-5) is one band-step short of 180, class C", () => {
    const { fields, inputs } = withTiers({ 8: "Other record", 9: true, 11: "None held", 2: [900_000, 500_000], 4: [1_000_000, 500_000], 10: false, 5: 666_667 });
    const rating = rate(fields, inputs, "Renewal");
    expect(rating.compositeScore).toBe(175);
    expect(rating.ratingClass).toBe("C");
  });
});
