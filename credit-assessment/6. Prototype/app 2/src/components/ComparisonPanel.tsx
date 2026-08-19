import { useMemo } from "react";
import { useStore } from "../store/useStore";
import { Card, SectionHeading } from "./Card";
import { Badge } from "./Badge";
import { formatCurrency, formatRatio } from "../utils/format";
import type { Assessment } from "../types";

/** FR8.8-FR8.9 — compare this assessment's freshly computed outputs against
 * the refresh source's already-stored ones. Suppresses any ratio Provisional
 * or Not Calculable on either side, and flags a differing config version
 * rather than presenting the delta as like-for-like. */
export function ComparisonPanel({ assessment }: { assessment: Assessment }) {
  const assessments = useStore((s) => s.assessments);
  const ratios = useStore((s) => s.ratios);
  const ratings = useStore((s) => s.ratings);
  const recommendations = useStore((s) => s.recommendations);
  const config = useStore((s) => s.config);

  const source = assessments.find((a) => a.id === assessment.sourceAssessmentId);

  const rows = useMemo(() => {
    if (!source) return [];
    const newPeriod = assessment.periods[assessment.periods.length - 1];
    const srcPeriod = source.periods[source.periods.length - 1];
    const newRatios = ratios.filter((r) => r.assessmentId === assessment.id && r.period === newPeriod);
    const srcRatios = ratios.filter((r) => r.assessmentId === source.id && r.period === srcPeriod);
    return newRatios
      .map((nr) => {
        const sr = srcRatios.find((r) => r.ratioKey === nr.ratioKey);
        if (!sr) return null;
        const configDiffers = nr.configVersionId !== sr.configVersionId;
        const suppressed = nr.provisionalFlag || nr.notCalculableFlag || sr.provisionalFlag || sr.notCalculableFlag;
        return { key: nr.ratioKey, label: nr.label, nr, sr, configDiffers, suppressed };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [assessment, source, ratios]);

  if (!source) return null;

  const newRating = ratings.find((r) => r.assessmentId === assessment.id);
  const srcRating = ratings.find((r) => r.assessmentId === source.id);
  const newRec = recommendations.find((r) => r.assessmentId === assessment.id);
  const srcRec = recommendations.find((r) => r.assessmentId === source.id);
  const gradeOrder = config.gradeBands.map((b) => b.grade);
  const ratingSuppressed = !!(newRating?.hasProvisionalInput || newRating?.hasNotCalculableInput || srcRating?.hasProvisionalInput || srcRating?.hasNotCalculableInput);

  return (
    <Card>
      <SectionHeading
        eyebrow="FR8.8 – FR8.9"
        title={`Comparison vs. v${source.version} (refresh source)`}
        dek="Reads the source assessment's stored rows — it is never re-derived, which would rescore a closed assessment (FR10.3)."
      />

      <table className="w-full text-sm mb-6">
        <thead>
          <tr className="text-left border-b border-[var(--line)]">
            <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Ratio</th>
            <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">v{source.version}</th>
            <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">v{assessment.version}</th>
            <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Delta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta = r.suppressed || r.nr.value === null || r.sr.value === null ? null : r.nr.value - r.sr.value;
            return (
              <tr key={r.key} className="border-b border-[var(--line)] last:border-0">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 font-mono text-xs">{formatRatio(r.sr.value, r.key)}</td>
                <td className="py-1.5 font-mono text-xs">{formatRatio(r.nr.value, r.key)}</td>
                <td className="py-1.5">
                  {r.suppressed ? (
                    <span className="text-xs text-[var(--muted)]">
                      unavailable — {r.nr.notCalculableFlag ? "new: Not Calculable" : r.sr.notCalculableFlag ? "prior: Not Calculable" : "Provisional input"}
                    </span>
                  ) : (
                    <span className={`font-mono text-xs ${delta! > 0 ? "text-[var(--low)]" : delta! < 0 ? "text-[var(--crit)]" : ""}`}>
                      {delta! > 0 ? "▲" : delta! < 0 ? "▼" : "—"} {formatRatio(Math.abs(delta!), r.key)}
                    </span>
                  )}
                  {r.configDiffers && <Badge tone="med">config version differs</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-mono uppercase text-[var(--muted)] mb-1">Rating movement</div>
          {ratingSuppressed ? (
            <p className="text-sm text-[var(--muted)]">Not compared — Provisional or Not Calculable input on one side.</p>
          ) : newRating && srcRating ? (
            <p className="text-sm">
              {srcRating.grade} → {newRating.grade}{" "}
              {gradeOrder.indexOf(newRating.grade) < gradeOrder.indexOf(srcRating.grade) ? (
                <Badge tone="low">improved</Badge>
              ) : gradeOrder.indexOf(newRating.grade) > gradeOrder.indexOf(srcRating.grade) ? (
                <Badge tone="crit">declined</Badge>
              ) : (
                <Badge tone="neutral">unchanged</Badge>
              )}
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">—</p>
          )}
        </div>
        <div>
          <div className="text-xs font-mono uppercase text-[var(--muted)] mb-1">Limit / terms movement</div>
          {ratingSuppressed ? (
            <p className="text-sm text-[var(--muted)]">Not compared.</p>
          ) : newRec && srcRec ? (
            <p className="text-sm font-mono">
              {formatCurrency(srcRec.proposedLimit)} / {srcRec.proposedTermsDays}d → {formatCurrency(newRec.proposedLimit)} / {newRec.proposedTermsDays}d
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">—</p>
          )}
        </div>
      </div>
    </Card>
  );
}
