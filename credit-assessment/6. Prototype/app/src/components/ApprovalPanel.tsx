import { useState } from "react";
import { useStore, useCurrentUser } from "../store/useStore";
import { Card, SectionHeading, Button } from "./Card";
import { formatDate } from "../utils/format";
import type { Assessment } from "../types";

export function ApprovalPanel({ assessment }: { assessment: Assessment }) {
  const user = useCurrentUser();
  const approvalDecisions = useStore((s) => s.approvalDecisions);
  const approveAssessment = useStore((s) => s.approveAssessment);
  const rejectAssessment = useStore((s) => s.rejectAssessment);
  const returnAssessment = useStore((s) => s.returnAssessment);
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decisions = approvalDecisions.filter((d) => d.assessmentId === assessment.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const canDecide = user.role === "Approver" && assessment.state === "Submitted";

  function act(fn: (id: string, comments: string) => { ok: boolean; reason?: string }) {
    const result = fn(assessment.id, comments);
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
          <SectionHeading eyebrow="FR7" title="Approval decision" dek="You must be a different user than the preparing analyst (FR7.5, system-enforced)." />
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Comments (required for Reject / Return)"
            className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)] mb-3 h-20"
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
        <SectionHeading eyebrow="FR7.3 / FR9" title="Approval history" />
        {decisions.length === 0 && <p className="text-sm text-[var(--muted)]">No decisions recorded yet.</p>}
        <ul className="space-y-2">
          {decisions.map((d) => (
            <li key={d.id} className="text-sm border-b border-[var(--line)] pb-2 last:border-0">
              <span className="font-semibold">{d.action}</span> by {d.actor} on {formatDate(d.timestamp)}
              {d.comments && <div className="text-[var(--muted)] text-xs mt-0.5">"{d.comments}"</div>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
