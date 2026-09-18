import { useMemo } from "react";
import { useStore } from "../store/useStore";
import { Card, SectionHeading } from "./Card";
import { Badge } from "./Badge";
import { formatRatioValue, formatChangePct } from "../utils/format";
import type { Assessment, RatioKey } from "../types";

const RATIO_ORDER: { key: RatioKey; label: string; trackedField?: string }[] = [
  { key: "working_capital", label: "Working Capital" },
  { key: "current_ratio", label: "Current Ratio" },
  { key: "net_profit_margin", label: "Net Profit Margin" },
  { key: "debt_to_equity", label: "Debt to Equity" },
];

const DERIVED_ORDER: { key: RatioKey; label: string }[] = [
  { key: "wc_over_revenue", label: "WC over Revenue (criterion 1)" },
  { key: "paid_up_capital_cover", label: "Paid-up Capital Cover (criterion 5)" },
  { key: "profitability_history", label: "Profitability History (criterion 6)" },
  { key: "years_established", label: "Years Established (criterion 7)" },
];

export function ResultsPanel({ assessment }: { assessment: Assessment }) {
  const allRatios = useStore((s) => s.ratios);
  const ratings = useStore((s) => s.ratings);

  const ratios = useMemo(() => allRatios.filter((r) => r.assessmentId === assessment.id), [allRatios, assessment.id]);
  const rating = ratings.find((r) => r.assessmentId === assessment.id);
  const periods = assessment.periods;
  const currentPeriod = periods[periods.length - 1];
  const priorPeriod = periods[0];

  if (periods.length < 2) {
    return (
      <Card>
        <p className="text-[var(--muted)]">No ratios yet — upload both periods and complete field review first.</p>
      </Card>
    );
  }

  if (!rating) {
    return (
      <Card>
        <p className="text-[var(--muted)]">Not yet computed — every review item must be Confirmed or Amended first (FR3.8).</p>
      </Card>
    );
  }

  function ratioCell(key: RatioKey, period: string | null) {
    const r = ratios.find((x) => x.ratioKey === key && x.period === period);
    if (!r) return <span className="text-[var(--muted)]">—</span>;
    if (r.notCalculableReason) return <Badge tone="mvp" title={r.notCalculableReason}>Not calculable</Badge>;
    if (r.zeroDivisorTierApplied !== null) return <Badge tone="accent" title={`Zero divisor: ${r.zeroDivisorField} — tier ${r.zeroDivisorTierApplied} applied per FR4.12`}>— (zero divisor)</Badge>;
    return <span className="font-mono">{formatRatioValue(r.valueNumeric, key)}</span>;
  }

  /** FR4.6 — period-over-period change of the ratio's own value, not stored,
   * computed at read time. Null (render "—") when either side isn't a plain
   * number or the prior value is zero. */
  function ratioChange(key: RatioKey): string {
    const current = ratios.find((x) => x.ratioKey === key && x.period === currentPeriod)?.valueNumeric;
    const prior = ratios.find((x) => x.ratioKey === key && x.period === priorPeriod)?.valueNumeric;
    if (typeof current !== "number" || typeof prior !== "number" || prior === 0) return "—";
    return formatChangePct((current - prior) / prior);
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeading eyebrow="FR4" title="Ratio Calculation" dek="Closed formulas (Baseline_Scorecard_Extract_v1.2.md). Full lineage to exact source field values (FR4.5)." />
        <table className="w-full text-sm mb-2">
          <tbody>
            {RATIO_ORDER.map((def) => (
              <tr key={def.key} className="border-b border-[var(--line)] last:border-0 align-top">
                <td className="py-2 pr-3 w-56 font-medium">{def.label}</td>
                <td className="py-2 pr-6">
                  <div className="text-[10px] text-[var(--muted)] font-mono mb-0.5">{priorPeriod}</div>
                  {ratioCell(def.key, priorPeriod)}
                </td>
                <td className="py-2 pr-6">
                  <div className="text-[10px] text-[var(--muted)] font-mono mb-0.5">{currentPeriod}</div>
                  {ratioCell(def.key, currentPeriod)}
                </td>
                <td className="py-2">
                  <div className="text-[10px] text-[var(--muted)] font-mono mb-0.5">Change (FR4.6)</div>
                  <span className="font-mono text-xs text-[var(--muted)]">{ratioChange(def.key)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <SectionHeading eyebrow="FR4.3" title="Derived scorecard inputs" dek="Computed alongside the ratios, consumed only by the scorecard." />
        <table className="w-full text-sm">
          <tbody>
            {DERIVED_ORDER.map((def) => (
              <tr key={def.key} className="border-b border-[var(--line)] last:border-0">
                <td className="py-2 pr-3 font-medium">{def.label}</td>
                <td className="py-2">
                  {def.key === "profitability_history"
                    ? profitabilityHistoryDisplay(ratios)
                    : ratioCell(def.key, def.key === "wc_over_revenue" ? currentPeriod : null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <SectionHeading eyebrow="FR6" title="Scorecard & Rating" dek="Eleven criteria, tier × weight, composite 100–300 (FR6.1). Quantitative and categorical — no qualitative override at MVP (V2, §7)." />
        <div className="flex items-baseline gap-4 mb-4">
          <div className="text-3xl font-serif-heading font-semibold">Class {rating.ratingClass}</div>
          <div>
            <div className="font-medium">{rating.handlingRoute}</div>
            <div className="text-xs text-[var(--muted)] font-mono">
              Composite {rating.compositeScore} / 300 · {rating.weightSet === "new" ? "New" : "Renewal"} weight set · scorecard {rating.scorecardVersion}
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          {rating.driverBreakdown.map((d) => (
            <div key={d.criterionNumber} className="flex items-center gap-2 text-xs">
              <span className="w-8 text-[var(--muted)] font-mono">#{d.criterionNumber}</span>
              <span className="w-44 truncate">{d.label}</span>
              <div className="flex-1 h-2 bg-[var(--line)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${(d.tier / 3) * 100}%` }} />
              </div>
              <span className="font-mono w-28 text-right text-[var(--muted)]">
                tier {d.tier} × {d.weight} = {d.contribution}
              </span>
              <span className="flex-1 text-[11px] text-[var(--muted)] truncate" title={d.sourceInput}>
                {d.sourceInput}
                {d.tierOneCondition && ` (${d.tierOneCondition.replace(/_/g, " ")})`}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function profitabilityHistoryDisplay(ratios: ReturnType<typeof useStore.getState>["ratios"]) {
  const r = ratios.find((x) => x.ratioKey === "profitability_history");
  if (!r) return <span className="text-[var(--muted)]">—</span>;
  if (r.notCalculableReason) return <Badge tone="mvp" title={r.notCalculableReason}>Not calculable</Badge>;
  const { currentPositive, priorPositive } = r.signPair ?? { currentPositive: null, priorPositive: null };
  return (
    <span className="font-mono text-sm">
      Prior: {priorPositive === null ? "confirmed absent" : priorPositive ? "profitable" : "loss"} · Current: {currentPositive === null ? "confirmed absent" : currentPositive ? "profitable" : "loss"}
    </span>
  );
}
