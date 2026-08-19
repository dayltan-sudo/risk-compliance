import { useState } from "react";
import { useStore, useCurrentUser } from "../store/useStore";
import { Card, SectionHeading, Button } from "./Card";
import { Badge } from "./Badge";
import { formatDate } from "../utils/format";
import type { Assessment } from "../types";

export function ExportPanel({ assessment }: { assessment: Assessment }) {
  const user = useCurrentUser();
  const config = useStore((s) => s.config);
  const extractedFields = useStore((s) => s.extractedFields).filter((f) => f.assessmentId === assessment.id);
  const ratios = useStore((s) => s.ratios).filter((r) => r.assessmentId === assessment.id);
  const rating = useStore((s) => s.ratings).find((r) => r.assessmentId === assessment.id);
  const rec = useStore((s) => s.recommendations).find((r) => r.assessmentId === assessment.id);
  const decisions = useStore((s) => s.approvalDecisions).filter((d) => d.assessmentId === assessment.id);
  const [generated, setGenerated] = useState<"pdf" | "excel" | null>(null);

  const masking = "OPEN in the PRD (§5) — no redaction treatment is specified, so this prototype exports fields as-is.";

  return (
    <Card>
      <SectionHeading
        eyebrow="FR11"
        title="Export & Reporting"
        dek="Reads only — never an alternative path to a value the pipeline didn't produce (Architecture Plan §06)."
      />
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs font-mono uppercase text-[var(--muted)] mb-2">Contents (FR11.1)</div>
          <ul className="text-sm space-y-1">
            <li>{extractedFields.length} extracted fields, confirmation status included</li>
            <li>{ratios.length} computed ratios with formula + lineage</li>
            <li>Rating: {rating ? `${rating.grade} — ${rating.compositeScore}/100` : "not yet computed"}</li>
            <li>Recommendation: {rec ? `${rec.currency} ${rec.proposedLimit.toLocaleString()} / ${rec.proposedTermsDays}d` : "not yet computed"}</li>
            <li>{decisions.length} approval decision{decisions.length === 1 ? "" : "s"}</li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-mono uppercase text-[var(--muted)] mb-2">Stamped for reconstructability (FR11.2)</div>
          <p className="text-sm font-mono">{config.version}</p>
          <div className="text-xs font-mono uppercase text-[var(--muted)] mt-4 mb-2">Role scope & masking (FR11.3)</div>
          <p className="text-sm">
            Exporting as <Badge tone="accent">{user.role}</Badge> — content is scoped to what {user.name} can see. Personal-data masking: {masking}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => setGenerated("pdf")}>Export PDF</Button>
        <Button variant="secondary" onClick={() => setGenerated("excel")}>
          Export Excel
        </Button>
      </div>
      {generated && (
        <p className="text-sm text-[var(--muted)] mt-3">
          {generated === "pdf" ? "PDF" : "Excel"} file assembled from the data above, config {config.version}, generated {formatDate(new Date().toISOString())}. (Prototype — no file is actually produced.)
        </p>
      )}
    </Card>
  );
}
