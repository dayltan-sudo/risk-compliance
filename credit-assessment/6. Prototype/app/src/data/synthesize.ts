// Deterministic pseudo-random financial statement synthesizer.
// Stands in for FR2's extraction pipeline: given a document, produces a
// plausible standardized field set. Seeded so the same customer/period
// combination always yields the same numbers.

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1k = (n: number) => Math.round(n / 1000) * 1000;

/** qualityBias in [-1, 1]: negative = weaker credit profile, positive = stronger. */
export function synthesizeFinancials(seedStr: string, qualityBias = 0): Record<string, number> {
  const rand = mulberry32(hashSeed(seedStr));
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const revenue = 1_000_000 + rand() * 4_000_000;
  const grossMarginPct = clamp(0.18 + qualityBias * 0.15 + (rand() - 0.5) * 0.08, 0.08, 0.5);
  const cogs = revenue * (1 - grossMarginPct);
  const grossProfit = revenue - cogs;
  const ebitdaPct = clamp(grossMarginPct * 0.4 + qualityBias * 0.05 + (rand() - 0.5) * 0.04, 0.02, 0.35);
  const ebitda = revenue * ebitdaPct;
  const da = ebitda * (0.15 + rand() * 0.1);
  const ebit = ebitda - da;
  const interestExpense = Math.max(revenue * (0.02 - qualityBias * 0.008 + rand() * 0.015), revenue * 0.004);
  const netIncome = ebit - interestExpense - revenue * (0.015 + rand() * 0.015);
  const cash = revenue * (0.03 + rand() * 0.05);
  const accountsReceivable = revenue * (0.08 + rand() * 0.08);
  const inventory = cogs * (0.08 + rand() * 0.1);
  const totalCurrentAssets = cash + accountsReceivable + inventory + revenue * 0.02;
  const totalAssets = totalCurrentAssets + revenue * (0.4 + rand() * 0.35);
  const accountsPayable = cogs * (0.06 + rand() * 0.07);
  const totalCurrentLiabilities = Math.max(accountsPayable + revenue * (0.06 - qualityBias * 0.02 + rand() * 0.06), accountsPayable * 1.1);
  const totalDebt = Math.max(totalAssets * (0.25 - qualityBias * 0.1 + rand() * 0.15), 0);
  const totalLiabilities = totalCurrentLiabilities + totalDebt * 0.7 + revenue * 0.03;
  const totalEquity = Math.max(totalAssets - totalLiabilities, totalAssets * 0.05);
  const operatingCashFlow = ebitda * (0.55 + qualityBias * 0.1 + rand() * 0.2) - interestExpense * 0.5;
  const capitalExpenditure = revenue * (0.02 + rand() * 0.03);

  return {
    "Cash & Equivalents": round1k(cash),
    "Accounts Receivable": round1k(accountsReceivable),
    Inventory: round1k(inventory),
    "Total Current Assets": round1k(totalCurrentAssets),
    "Total Assets": round1k(totalAssets),
    "Accounts Payable": round1k(accountsPayable),
    "Total Current Liabilities": round1k(totalCurrentLiabilities),
    "Total Debt": round1k(totalDebt),
    "Total Liabilities": round1k(totalLiabilities),
    "Total Equity": round1k(totalEquity),
    Revenue: round1k(revenue),
    "Cost of Goods Sold": round1k(cogs),
    "Gross Profit": round1k(grossProfit),
    EBITDA: round1k(ebitda),
    EBIT: round1k(ebit),
    "Interest Expense": round1k(interestExpense),
    "Net Income": round1k(netIncome),
    "Operating Cash Flow": round1k(operatingCashFlow),
    "Capital Expenditure": round1k(capitalExpenditure),
  };
}

/** FR2.2 confidence: mock extraction confidence, mostly High with some Medium/Low scatter. */
export function synthesizeConfidence(seedStr: string): number {
  const rand = mulberry32(hashSeed(seedStr + "-conf"));
  const r = rand();
  if (r < 0.72) return Math.round(90 + rand() * 10); // High
  if (r < 0.92) return Math.round(70 + rand() * 20); // Medium
  return Math.round(40 + rand() * 30); // Low
}
