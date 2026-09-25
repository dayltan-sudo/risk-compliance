import type { StandardFieldName } from "../types.js";

// Deterministic pseudo-random financial statement synthesizer.
// Stands in for FR2's extraction pipeline: given a document, produces a
// plausible standardized field set (FR2.2's closed 11-field set). Seeded so
// the same customer/division/period combination always yields the same
// numbers within a session. Balance-sheet totals are always derived by
// construction (Total Assets = CA+NCA, etc.), so live-synthesized uploads
// always pass all nine FR3.7 integrity checks — the seed data's narrative
// scenarios author their own figures directly where a check needs to fail.

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
export function synthesizeFinancials(seedStr: string, qualityBias = 0): Record<StandardFieldName, number | boolean> {
  const rand = mulberry32(hashSeed(seedStr));
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const sales = 1_000_000 + rand() * 4_000_000;
  const netMarginPct = clamp(0.04 + qualityBias * 0.12 + (rand() - 0.5) * 0.08, -0.15, 0.4);
  const npat = sales * netMarginPct;

  const cash = sales * (0.03 + rand() * 0.05);
  const otherCurrentAssets = sales * (0.15 + rand() * 0.12);
  const currentAssets = cash + otherCurrentAssets;
  const nonCurrentAssets = sales * (0.4 + rand() * 0.35);
  const totalAssets = currentAssets + nonCurrentAssets;

  const currentLiabilities = Math.max(sales * (0.08 - qualityBias * 0.02 + rand() * 0.08), sales * 0.01);
  const nonCurrentLiabilities = Math.max(totalAssets * (0.15 - qualityBias * 0.06 + rand() * 0.12), 0);
  const totalLiabilities = currentLiabilities + nonCurrentLiabilities;
  const totalEquity = totalAssets - totalLiabilities;

  const operatingCashFlowPositive = netMarginPct + qualityBias * 0.05 + (rand() - 0.5) * 0.1 > -0.02;

  return {
    Sales: round1k(sales),
    NPAT: round1k(npat),
    "Current Assets": round1k(currentAssets),
    "Cash and Bank Balances": round1k(cash),
    "Non-Current Assets": round1k(nonCurrentAssets),
    "Total Assets": round1k(totalAssets),
    "Current Liabilities": round1k(currentLiabilities),
    "Non-Current Liabilities": round1k(nonCurrentLiabilities),
    "Total Liabilities": round1k(totalLiabilities),
    "Total Equity": round1k(totalEquity),
    "Net Operating Cash Flow Positive": operatingCashFlowPositive,
  };
}

/** FR2.6 confidence: mock extraction confidence, mostly High with some Medium/Low scatter. */
export function synthesizeConfidence(seedStr: string): number {
  const rand = mulberry32(hashSeed(seedStr + "-conf"));
  const r = rand();
  if (r < 0.72) return Math.round(90 + rand() * 10); // High
  if (r < 0.92) return Math.round(70 + rand() * 20); // Medium
  return Math.round(40 + rand() * 30); // Low
}

/** FR5.8 tier 1 mock — stands in for a real ACRA registry extraction of
 * paid-up capital. */
export function synthesizePaidUpCapital(seedStr: string): number {
  const rand = mulberry32(hashSeed(seedStr + "-paidup"));
  return round1k(50_000 + rand() * 950_000);
}
