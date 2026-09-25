import { useState } from "react";
import { useStore } from "../store/useStore.js";
import { Card, SectionHeading, Button } from "./Card.js";
import { formatDate } from "../utils/format.js";
import type { Assessment } from "../types.js";

export function ExportPanel({ assessment }: { assessment: Assessment }) {
  const extractedFields = useStore((s) => s.extractedFields).filter((f) => f.assessmentId === assessment.id);
  const criterionInputs = useStore((s) => s.criterionInputs).filter((c) => c.assessmentId === assessment.id);
  const integrityChecks = useStore((s) => s.integrityChecks).filter((c) => c.assessmentId === assessment.id);
  const ratios = useStore((s) => s.ratios).filter((r) => r.assessmentId === assessment.id);
  const rating = useStore((s) => s.ratings).find((r) => r.assessmentId === assessment.id);
  const commentary = useStore((s) => s.riskCommentaries).find((c) => c.assessmentId === assessment.id && c.supersededAt === null);
  const decisions = useStore((s) => s.approvalDecisions).filter((d) => d.assessmentId === assessment.id);
  const [generated, setGenerated] = useState<"pdf" | "excel" | null>(null);

  const extractionModelVersions = Array.from(new Set(extractedFields.map((f) => f.extractionModelVersion).filter((v): v is string => !!v)));
  const failedChecks = integrityChecks.filter((c) => !c.passed).length;

  return (
    <Card>
      <SectionHeading
        title="Export & Reporting"
        dek="Read-only, assembled entirely from stored results — never a second path to a value the pipeline didn't produce."
      />
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs font-mono uppercase text-[var(--muted)] mb-2">Contents</div>
          <ul className="text-sm space-y-1">
            <li>{extractedFields.length} extracted fields, confirmation status and source scale included</li>
            <li>{integrityChecks.length} integrity checks — {failedChecks} failure{failedChecks === 1 ? "" : "s"}</li>
            <li>{ratios.length} computed ratios with formula and lineage</li>
            <li>{criterionInputs.length} criterion inputs and tiers</li>
            <li>Composite / class: {rating ? `${rating.compositeScore} — Class ${rating.ratingClass} (${rating.handlingRoute})` : "not yet computed"}</li>
            <li>Risk commentary: {commentary ? (commentary.noObservations ? "no observations" : `${commentary.observations.length} observation(s), model-generated`) : "not yet generated"}</li>
            <li>{decisions.length} approval decision{decisions.length === 1 ? "" : "s"}</li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-mono uppercase text-[var(--muted)] mb-2">Stamped for reconstructability</div>
          <p className="text-sm font-mono">Extraction model(s): {extractionModelVersions.join(", ") || "n/a"}</p>
          <p className="text-sm font-mono">Scorecard: {rating?.scorecardVersion ?? "n/a"}</p>
          <p className="text-sm font-mono">Export date: {formatDate(new Date().toISOString())}</p>
          <div className="text-xs font-mono uppercase text-[var(--muted)] mt-4 mb-2">Personal data</div>
          <p className="text-sm">No redaction applied — enterprise-level controls handle this, not the workflow application.</p>
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
          {generated === "pdf" ? "PDF" : "Excel"} file assembled from the data above. (Prototype — no file is actually produced.)
        </p>
      )}
    </Card>
  );
}
