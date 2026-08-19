import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { Card, SectionHeading, Button } from "./Card";
import { RatioFlagBadge, Badge } from "./Badge";
import { formatCurrency, formatRatio } from "../utils/format";
import type { Assessment, RatioCategory } from "../types";

const CATEGORIES: RatioCategory[] = ["Liquidity", "Leverage", "Profitability", "Coverage", "Efficiency"];

export function ResultsPanel({ assessment, editable }: { assessment: Assessment; editable: boolean }) {
  const allRatios = useStore((s) => s.ratios);
  const allFields = useStore((s) => s.extractedFields);
  const ratings = useStore((s) => s.ratings);
  const recommendations = useStore((s) => s.recommendations);
  const overrideRecommendation = useStore((s) => s.overrideRecommendation);
  const config = useStore((s) => s.config);

  const ratios = useMemo(() => allRatios.filter((r) => r.assessmentId === assessment.id), [allRatios, assessment.id]);
  const rating = ratings.find((r) => r.assessmentId === assessment.id);
  const rec = recommendations.find((r) => r.assessmentId === assessment.id);
  const periods = assessment.periods;
  const mostRecentPeriod = periods[periods.length - 1];

  const [showOverride, setShowOverride] = useState(false);
  const [overrideLimit, setOverrideLimit] = useState(rec ? String(rec.proposedLimit) : "");
  const [overrideTerms, setOverrideTerms] = useState(rec ? String(rec.proposedTermsDays) : "");
  const [overrideJustification, setOverrideJustification] = useState("");

  if (periods.length === 0) {
    return (
      <Card>
        <p className="text-[var(--muted)]">No ratios yet — upload documents and review fields first.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeading eyebrow="FR4" title="Ratio Calculation" dek="PLACEHOLDER formulas — see config badge in the footer. Full lineage to exact source field values (FR4.2)." />
        {CATEGORIES.map((cat) => {
          const catRatios = ratios.filter((r) => r.category === cat && r.period === mostRecentPeriod);
          if (catRatios.length === 0) return null;
          return (
            <div key={cat} className="mb-4 last:mb-0">
              <h4 className="text-xs font-mono uppercase tracking-wide text-[var(--muted)] mb-2">{cat}</h4>
              <table className="w-full text-sm mb-2">
                <tbody>
                  {catRatios.map((r) => {
                    const trend = periods.map((p) => ratios.find((x) => x.ratioKey === r.ratioKey && x.period === p));
                    const lineage = r.lineageFieldIds.map((id) => allFields.find((f) => f.id === id)).filter(Boolean);
                    return (
                      <tr key={r.id} className="border-b border-[var(--line)] last:border-0 align-top">
                        <td className="py-2 pr-3 w-48">
                          <div className="font-medium">{r.label}</div>
                          <div className="text-[11px] text-[var(--muted)] font-mono">{r.formulaDisplay}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {trend.map((t, i) => (
                              <span key={i} className="inline-flex items-center gap-1">
                                <span className="font-mono text-xs text-[var(--muted)]">
                                  {formatRatio(t?.value ?? null, r.ratioKey)}
                                  {i < trend.length - 1 ? " →" : ""}
                                </span>
                                {t && (t.provisionalFlag || t.notCalculableFlag) && (
                                  <RatioFlagBadge provisional={t.provisionalFlag} notCalculable={t.notCalculableFlag} />
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 text-[11px] text-[var(--muted)]">
                          {lineage.length > 0 && (
                            <details>
                              <summary className="cursor-pointer text-[var(--accent-deep)]">lineage</summary>
                              <ul className="mt-1">
                                {lineage.map((f) => (
                                  <li key={f!.id}>
                                    {f!.fieldName} ({f!.period}): {formatCurrency(f!.value)} — {f!.status}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </Card>

      <Card>
        <SectionHeading eyebrow="FR5" title="Internal Credit Rating" dek="PLACEHOLDER weighted scorecard. Quantitative-only at MVP — qualitative override is V2 (FR5.3), not built here." />
        {rating ? (
          <div>
            <div className="flex items-baseline gap-4 mb-4">
              <div className="text-3xl font-serif-heading font-semibold">{rating.grade}</div>
              <div>
                <div className="font-medium">{rating.band}</div>
                <div className="text-xs text-[var(--muted)] font-mono">Composite score {rating.compositeScore} / 100 · {mostRecentPeriod}</div>
              </div>
              {rating.hasProvisionalInput && <Badge tone="med">Contains Provisional input</Badge>}
              {rating.hasNotCalculableInput && <Badge tone="mvp">Contains Not Calculable input (excluded & reweighted)</Badge>}
            </div>
            <div className="space-y-1.5">
              {rating.driverBreakdown.map((d) => (
                <div key={d.ratioKey} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate">{d.label}</span>
                  <div className="flex-1 h-2 bg-[var(--line)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${d.points}%` }} />
                  </div>
                  <span className="font-mono w-24 text-right text-[var(--muted)]">
                    {d.points}pts × {(d.weight * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[var(--muted)]">Not yet computed.</p>
        )}
      </Card>

      <Card>
        <SectionHeading eyebrow="FR6" title="Credit Limit / Terms Recommendation" dek="A proposal only — never auto-applied. Final limit and terms are set through the approval workflow (FR6.2)." />
        {!rec && rating?.hasProvisionalInput && (
          <p className="text-sm text-[var(--med)]">
            Blocked: FR3.10 never passes a Provisional rating to the Recommendation Engine. Resolve every Provisional field-period first.
          </p>
        )}
        {rec && (
          <div>
            <div className="flex items-baseline gap-6 mb-3">
              <div>
                <div className="text-2xl font-semibold">{formatCurrency(rec.proposedLimit, rec.currency)}</div>
                <div className="text-xs text-[var(--muted)]">Proposed limit</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{rec.proposedTermsDays}d</div>
                <div className="text-xs text-[var(--muted)]">Payment terms</div>
              </div>
              {rec.overrideFlag && <Badge tone="accent">Overridden</Badge>}
              {rec.effectiveDate && <Badge tone="low">Effective {rec.effectiveDate}</Badge>}
            </div>
            {rec.overrideFlag && (
              <p className="text-xs text-[var(--muted)] mb-2">
                System proposed {formatCurrency(rec.systemProposedLimit, rec.currency)} / {rec.systemProposedTermsDays}d — retained alongside the override. Justification: "{rec.overrideJustification}"
              </p>
            )}

            {editable && !rec.overrideFlag && !showOverride && (
              <Button variant="secondary" onClick={() => setShowOverride(true)}>
                Override
              </Button>
            )}
            {editable && showOverride && (
              <div className="mt-3 border-t border-[var(--line)] pt-3 space-y-2 max-w-sm">
                <div>
                  <label className="block text-xs font-medium mb-1">Override limit</label>
                  <input value={overrideLimit} onChange={(e) => setOverrideLimit(e.target.value)} type="number" className="w-full border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--paper)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Override terms (days)</label>
                  <input value={overrideTerms} onChange={(e) => setOverrideTerms(e.target.value)} type="number" className="w-full border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--paper)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Justification (required)</label>
                  <input value={overrideJustification} onChange={(e) => setOverrideJustification(e.target.value)} className="w-full border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--paper)]" />
                </div>
                <Button
                  disabled={!overrideJustification.trim()}
                  onClick={() => {
                    overrideRecommendation(assessment.id, Number(overrideLimit), Number(overrideTerms), overrideJustification.trim());
                    setShowOverride(false);
                  }}
                >
                  Save override
                </Button>
              </div>
            )}
          </div>
        )}
        <p className="text-[10px] text-[var(--muted)] font-mono mt-3">config {config.version}</p>
      </Card>
    </div>
  );
}
