import { useStore } from "../store/useStore";
import { Card, SectionHeading } from "./Card";
import { ModelGeneratedBadge, Badge } from "./Badge";
import { formatDate } from "../utils/format";
import type { Assessment } from "../types";

export function RiskCommentaryPanel({ assessment }: { assessment: Assessment }) {
  const commentary = useStore((s) => s.riskCommentaries).find((c) => c.assessmentId === assessment.id && c.supersededAt === null);

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <SectionHeading
          eyebrow="FR11"
          title="Risk Commentary"
          dek="Advisory observations the eleven-criterion scorecard cannot express. Never changes the score, recommends no action, and carries no severity."
        />
        <ModelGeneratedBadge />
      </div>

      {!commentary && <p className="text-sm text-[var(--muted)]">Not yet generated — runs automatically once a Rating is computed.</p>}

      {commentary && commentary.noObservations && (
        <p className="text-sm text-[var(--muted)]">No observations for this assessment — a positive result, not a missing one (FR11.6).</p>
      )}

      {commentary && !commentary.noObservations && (
        <ul className="space-y-3">
          {commentary.observations.map((o, i) => (
            <li key={i} className="border border-[var(--line)] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="v2">{o.category}</Badge>
              </div>
              <p className="text-sm mb-2">{o.statement}</p>
              <ul className="text-xs text-[var(--muted)] font-mono space-y-0.5">
                {o.citedFigures.map((f, j) => (
                  <li key={j}>
                    {f.entity} — {f.field}: {f.value}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {commentary && (
        <p className="text-[10px] text-[var(--muted)] font-mono mt-3">
          {commentary.modelVersion} / {commentary.promptVersion} · generated {formatDate(commentary.generatedAt)}
        </p>
      )}
    </Card>
  );
}
