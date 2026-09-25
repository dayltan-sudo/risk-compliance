import { z } from "zod";
import { callStructuredLLM } from "./llm.js";
import { setAgentStatus } from "./agentActivity.js";
import type { CitedFigure, CriterionInput, ExtractedField, ObservationCategory, Rating, RiskCommentary, RiskObservation, Ratio } from "../../src/types.js";

// FR11 — Risk Commentary, the second and last model surface. Reads a
// finished Rating and the confirmed data behind it; writes only prose, never
// a class, tier, or score (FR11.2). Rather than trust the model's own
// citation text, every observation may only point at entries in a
// server-built "figure catalog" resolved from real confirmed data — the
// model selects catalog keys, we resolve them to the real value server-side.
// This makes FR11.3's citation check a real data check, not a format check,
// and makes a hallucinated figure impossible to smuggle into the record.

const MODEL_VERSION = "deepseek-v4.1-flash@opencode-go";
const PROMPT_VERSION = "risk-commentary-v1";

interface CatalogEntry extends CitedFigure {
  key: string;
}

function fieldDisplayValue(f: ExtractedField): string {
  if (f.value === null) return "confirmed absent";
  if (typeof f.value === "boolean") return f.value ? "Yes" : "No";
  return f.value.toLocaleString();
}

function ratioDisplayValue(r: Ratio): string | null {
  if (r.valueNumeric === null) return null;
  const hint = (() => {
    switch (r.ratioKey) {
      case "current_ratio":
      case "debt_to_equity":
      case "paid_up_capital_cover":
        return "x";
      case "net_profit_margin":
      case "wc_over_revenue":
        return "pct";
      case "years_established":
        return "years";
      default:
        return "num";
    }
  })();
  if (hint === "pct") return `${(r.valueNumeric * 100).toFixed(1)}%`;
  if (hint === "x") return `${r.valueNumeric.toFixed(2)}x`;
  if (hint === "years") return `${r.valueNumeric.toFixed(1)} years`;
  return r.valueNumeric.toLocaleString();
}

function buildFigureCatalog(opts: {
  rating: Rating;
  ratios: Ratio[];
  fields: ExtractedField[];
  criterionInputs: CriterionInput[];
}): CatalogEntry[] {
  const catalog: CatalogEntry[] = [];

  for (const f of opts.fields) {
    catalog.push({ key: `field:${f.period}:${f.fieldName}`, entity: f.period, field: f.fieldName, value: fieldDisplayValue(f) });
  }

  for (const r of opts.ratios) {
    const value = ratioDisplayValue(r);
    if (value === null) continue;
    catalog.push({ key: `ratio:${r.ratioKey}:${r.period ?? "n/a"}`, entity: r.period ?? "Both periods", field: r.label, value });
  }

  for (const c of opts.criterionInputs) {
    if (c.criterionNumber === 5) {
      if (c.paidUpCapital !== null) catalog.push({ key: "criterion:5:paidUpCapital", entity: "Criterion 5 input", field: "Paid-up Capital", value: c.paidUpCapital.toLocaleString() });
      if (c.totalExposure !== null) catalog.push({ key: "criterion:5:totalExposure", entity: "Criterion 5 input", field: "Total Exposure", value: c.totalExposure.toLocaleString() });
    }
    if (c.criterionNumber === 7 && c.yearRegisteredSg !== null) {
      catalog.push({ key: "criterion:7:yearRegisteredSg", entity: "Criterion 7 input", field: "Year Registered in SG", value: String(c.yearRegisteredSg) });
    }
    if (c.criterionNumber === 8 && c.litigationRecord !== null) {
      catalog.push({ key: "criterion:8:litigationRecord", entity: "Criterion 8 input", field: "Litigation Record", value: c.litigationRecord });
    }
    if (c.criterionNumber === 9 && c.changeInDirectors !== null) {
      catalog.push({ key: "criterion:9:changeInDirectors", entity: "Criterion 9 input", field: "Change in Directors", value: c.changeInDirectors ? "Yes" : "No" });
    }
    if (c.criterionNumber === 11 && c.promptPaymentRecord !== null) {
      catalog.push({ key: "criterion:11:promptPaymentRecord", entity: "Criterion 11 input", field: "Prompt Payment Record", value: c.promptPaymentRecord });
    }
  }

  catalog.push({ key: "rating:compositeScore", entity: "This assessment", field: "Composite Score", value: String(opts.rating.compositeScore) });
  catalog.push({ key: "rating:class", entity: "This assessment", field: "Rating Class", value: opts.rating.ratingClass });
  for (const d of opts.rating.driverBreakdown) {
    catalog.push({
      key: `rating:driver:${d.criterionNumber}`,
      entity: "This assessment",
      field: `Criterion ${d.criterionNumber} (${d.label})`,
      value: `Tier ${d.tier}, contribution ${d.contribution} — ${d.sourceInput}`,
    });
  }

  return catalog;
}

const CATEGORIES: ObservationCategory[] = ["Earnings quality", "Capital erosion", "Liquidity composition", "Concentration", "Trajectory", "Boundary proximity"];

const CandidateSchema = z.object({
  category: z.enum(CATEGORIES as [ObservationCategory, ...ObservationCategory[]]),
  statement: z.string().min(1),
  citedFigureKeys: z.array(z.string()).min(1),
});

// No severity/rank/score field exists anywhere in this schema — FR11.5 is
// enforced structurally, not by stripping a field the model might set.
const ResponseSchema = z.object({
  observations: z.array(CandidateSchema),
});

function buildSystemPrompt(catalog: CatalogEntry[]): string {
  const catalogLines = catalog.map((e) => `- ${e.key}: ${e.entity} / ${e.field} = ${e.value}`).join("\n");
  return `You are a senior credit analyst writing the "so what" behind a finished, already-computed credit rating. The reader can already see every ratio and figure on the screen above your commentary — your job is NOT to repeat those numbers back to them. Your job is to spot what a rigid eleven-criterion scorecard with hard bands cannot express: oddities, contradictions, concentration risk, deteriorating or improving trends, and gaps in the picture — and explain in one sentence why each one matters for this company's creditworthiness. You never revise, question, or comment on the score itself.

What makes an observation worth writing (write it only if true):
- It is surprising, inconsistent, or not obvious from a single ratio in isolation (e.g. a ratio that looks fine in isolation but is driven by something concerning, or two figures that pull in opposite directions).
- It says what the pattern implies about repayment capacity, resilience, or risk of default — not just that the pattern exists.
- It would change what a reviewer pays attention to next, good or bad — a genuine strength is just as valid an observation as a genuine weakness.

What NOT to write:
- Do not just juxtapose two periods' values with no interpretation (e.g. "X was 1.78x in FY2024 and 0.79x in FY2025" is not an observation by itself — say what that swing means: a company able to cover current liabilities 1.78 times over now cannot cover them at all, which raises near-term repayment risk).
- Do not restate a figure that is already unremarkable on its own.
- Do not write two observations that make the same point about the same underlying figures.

Hard rules, no exceptions:
1. You never propose approving, rejecting, returning, or changing any limit or exposure.
2. You never say whether the computed class is right, wrong, or should be different, and you never suggest a different class.
3. You never assign a severity, rank, priority, or any second score to an observation.
4. Every observation must be citable: it may reference ONLY the figures listed below by their exact key, and no other numbers or facts. Do not invent, estimate, or restate a figure with a different value than the one given.
5. Zero observations is a valid, expected result — only write an observation when a pattern genuinely worth flagging is present in these figures. Do not pad the list to hit a count.

Candidate categories (a starting set — use whichever fits, or none; a company can also look genuinely strong, not just weak):
- Earnings quality: profit is positive but operating cash flow is not (or vice versa — cash generation outpacing reported profit)
- Capital erosion: total equity sits far below paid-up capital, or equity is compounding down toward it
- Liquidity composition: a current ratio's apparent health or weakness rests on something other than cash (receivables, inventory) — or is unusually cash-heavy
- Concentration: total exposure is large against the customer's sales, or one figure dominates the balance sheet unusually
- Trajectory: a ratio has moved sharply period-over-period — for better or worse — enough to change the story the current-period number alone would tell
- Boundary proximity: the composite sits within a few points of a different class boundary (240 or 180), making this rating more sensitive to the next period's numbers than usual
- Data gap: a field the scorecard needs is confirmed absent or unusually thin, leaving a blind spot worth naming

Available figures (cite ONLY by these exact keys):
${catalogLines}

Respond with ONLY a single JSON object of this exact shape, no markdown fences, no commentary:
{"observations": [{"category": string, "statement": string, "citedFigureKeys": string[]}, ...]}

Each statement must lead with the interpretation (what this means for credit risk), not the raw numbers — the cited figures are already visible to the reader, so use them to support your point rather than to open the sentence. Contain no recommendation, no opinion on the class, and no severity/rank. If nothing meets the bar, return {"observations": []}.`;
}

const RECOMMENDATION_PATTERNS = [
  /\brecommend/i,
  /\bshould (be )?(approv|reject|return|declin|increas|decreas|reduc|limit)/i,
  /\b(approve|reject|decline) this/i,
  /\bclass (a|b|c) (is|would be|should be)/i,
  /\b(correctly|incorrectly|wrongly) rated/i,
  /\bsuggest(s|ing)? (a )?(different|lower|higher) class/i,
  /\b(severity|priority|risk score|risk rank)\b/i,
];

function containsRecommendationOrOpinion(statement: string): boolean {
  return RECOMMENDATION_PATTERNS.some((p) => p.test(statement));
}

export async function generateRiskCommentaryLLM(
  assessmentId: string,
  ratingId: string,
  rating: Rating,
  ratios: Ratio[],
  fields: ExtractedField[],
  criterionInputs: CriterionInput[],
  now: string,
): Promise<RiskCommentary> {
  const catalog = buildFigureCatalog({ rating, ratios, fields, criterionInputs });
  const catalogByKey = new Map(catalog.map((e) => [e.key, e]));

  let observations: RiskObservation[] = [];
  let modelVersion = MODEL_VERSION;

  await setAgentStatus(assessmentId, "risk_commentary", "running", "Generating risk commentary for the new rating");
  try {
    const result = await callStructuredLLM({
      system: buildSystemPrompt(catalog),
      user: "Generate the risk commentary for this assessment's current rating, following every rule above exactly.",
      schema: ResponseSchema,
      sessionId: `commentary-${assessmentId}-${ratingId}`,
    });

    for (const candidate of result.observations) {
      // Node 4 — citation check: only keys that resolve to real catalog
      // entries survive; a candidate left with no citations is dropped.
      const citedFigures: CitedFigure[] = candidate.citedFigureKeys
        .map((k) => catalogByKey.get(k))
        .filter((e): e is CatalogEntry => e !== undefined)
        .map(({ entity, field, value }) => ({ entity, field, value }));
      if (citedFigures.length === 0) continue;

      // Node 5 — recommendation/opinion strip (defense-in-depth on top of the
      // system prompt's hard rules; severity is already structurally absent
      // from the schema, satisfying Node 6 without a strip step).
      if (containsRecommendationOrOpinion(candidate.statement)) continue;

      observations.push({ category: candidate.category, statement: candidate.statement, citedFigures });
    }
    await setAgentStatus(
      assessmentId,
      "risk_commentary",
      "done",
      observations.length === 0 ? "No observations found for this rating" : `${observations.length} observation${observations.length === 1 ? "" : "s"} generated`,
    );
  } catch (err) {
    // An LLM outage must never block the Rating/Ratio write this cascade
    // also performs (FR11.2's non-interference cuts both ways) — write an
    // honest, auditable no_observations record instead of leaving none.
    observations = [];
    const reason = err instanceof Error ? err.message : String(err);
    modelVersion = `${MODEL_VERSION} (generation failed: ${reason})`;
    await setAgentStatus(assessmentId, "risk_commentary", "failed", reason);
  }

  return {
    id: `commentary-${assessmentId}-${now}`,
    assessmentId,
    ratingId,
    observations,
    noObservations: observations.length === 0,
    modelVersion,
    promptVersion: PROMPT_VERSION,
    generatedAt: now,
    supersededAt: null,
  };
}
