import { useState } from "react";
import { useStore } from "../store/useStore.js";
import { Card, SectionHeading, Button } from "./Card.js";
import { FieldReviewPanel } from "./FieldReviewPanel.js";
import { CriterionInputPanel } from "./CriterionInputPanel.js";
import { ResultsPanel } from "./ResultsPanel.js";
import { RiskCommentaryPanel } from "./RiskCommentaryPanel.js";
import { formatDate } from "../utils/format.js";
import type { Assessment } from "../types.js";

export function ApprovalPanel({ assessment }: { assessment: Assessment }) {
  const approvalDecisions = useStore((s) => s.approvalDecisions);
  const auditLog = useStore((s) => s.auditLog);
  const approveAssessment = useStore((s) => s.approveAssessment);
  const rejectAssessment = useStore((s) => s.rejectAssessment);
  const returnAssessment = useStore((s) => s.returnAssessment);
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decisions = approvalDecisions.filter((d) => d.assessmentId === assessment.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const relatedAudit = auditLog.filter((e) => e.entityId === assessment.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const canDecide = assessment.state === "Submitted";

  async function act(fn: (id: string, comments: string) => Promise<{ ok: boolean; reason?: string }>) {
    const result = await fn(assessment.id, comments);
    if (!result.ok) setError(result.reason ?? "Action failed.");
    else {
      setError(null);
      setComments("");
    }
  }

  return (
    <div className="space-y-4">
      {canDecide && (
        <Card>
          <SectionHeading title="Approval decision" dek="Allow-any at MVP — no segregation of duties. Every action is still attributed and logged." />
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Comments (required for Reject / Return)"
            className="w-full field mb-3 h-20"
          />
          {error && <p className="text-sm text-[var(--crit)] mb-3">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={() => act(approveAssessment)}>Approve</Button>
            <Button variant="secondary" onClick={() => act(returnAssessment)}>
              Return for Revision
            </Button>
            <Button variant="danger" onClick={() => act(rejectAssessment)}>
              Reject
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <SectionHeading title="Approval history" />
        {decisions.length === 0 && <p className="text-sm text-[var(--muted)]">No decisions recorded yet.</p>}
        <ul className="space-y-2">
          {decisions.map((d) => (
            <li key={d.id} className="text-sm border-b border-[var(--line)] pb-2 last:border-0">
              <span className="font-semibold">{d.action}</span> by {d.actor} on {formatDate(d.timestamp)}
              <span className="text-[10px] text-[var(--muted)] font-mono ml-2">policy {d.policyVersion}</span>
              {d.comments && <div className="text-[var(--muted)] text-xs mt-0.5">"{d.comments}"</div>}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionHeading title="Full lineage before deciding" dek="Extraction, integrity checks, ratio lineage, criterion inputs, driver breakdown, and audit trail — the same view for every decision, no restricted subset." />
        <div className="space-y-6">
          <FieldReviewPanel assessment={assessment} editable={false} />
          <CriterionInputPanel assessment={assessment} editable={false} />
          <ResultsPanel assessment={assessment} />
          <RiskCommentaryPanel assessment={assessment} />
          <div>
            <h4 className="text-xs font-mono uppercase tracking-wide text-[var(--muted)] mb-2">Audit trail for this assessment</h4>
            <ul className="text-xs font-mono text-[var(--muted)] space-y-1 max-h-64 overflow-y-auto">
              {relatedAudit.map((e) => (
                <li key={e.id}>
                  {formatDate(e.timestamp)} · {e.actor} · {e.action}
                </li>
              ))}
              {relatedAudit.length === 0 && <li>No entries.</li>}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
