import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore, useCurrentUser } from "../store/useStore";
import { customerVisibleToUser, isReturnedForRevision, lastReturnComment, reviewProgress } from "../store/selectors";
import { Card, SectionHeading, Button } from "../components/Card";
import { AssessmentStateBadge, Badge } from "../components/Badge";
import { DocumentUploadPanel } from "../components/DocumentUploadPanel";
import { FieldReviewPanel } from "../components/FieldReviewPanel";
import { ResultsPanel } from "../components/ResultsPanel";
import { ApprovalPanel } from "../components/ApprovalPanel";
import { ComparisonPanel } from "../components/ComparisonPanel";
import { ExportPanel } from "../components/ExportPanel";
import { formatDate } from "../utils/format";

type Tab = "upload" | "review" | "results" | "approval" | "compare" | "export";

export function AssessmentWorkspacePage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const user = useCurrentUser();
  const customers = useStore((s) => s.customers);
  const assessments = useStore((s) => s.assessments);
  const extractedFields = useStore((s) => s.extractedFields);
  const ratios = useStore((s) => s.ratios);
  const approvalDecisions = useStore((s) => s.approvalDecisions);
  const submitForApproval = useStore((s) => s.submitForApproval);

  const assessment = assessments.find((a) => a.id === assessmentId);
  const [tab, setTab] = useState<Tab>("review");
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!assessment) return <p>Assessment not found.</p>;
  const customer = customers.find((c) => c.id === assessment.customerId)!;
  const custAssessments = assessments.filter((a) => a.customerId === customer.id);

  if (!customerVisibleToUser(user, customer, custAssessments)) {
    return (
      <Card>
        <p className="text-[var(--crit)]">You don't have access to this assessment (NFR RBAC).</p>
      </Card>
    );
  }

  const editable = user.role === "Analyst" && assessment.state === "Draft";
  const returned = isReturnedForRevision(assessment, approvalDecisions);
  const returnComment = returned ? lastReturnComment(assessment, approvalDecisions) : undefined;
  const progress = reviewProgress(extractedFields, assessment.id);
  const provisionalCount = ratios.filter((r) => r.assessmentId === assessment.id && r.provisionalFlag).length;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "upload", label: "1. Upload Documents", show: editable },
    { id: "review", label: editable ? "2. Review Fields" : "Fields (read-only)", show: true },
    { id: "results", label: editable ? "3. Ratios & Rating" : "Ratios & Rating", show: true },
    { id: "approval", label: "Approval", show: assessment.state !== "Draft" || (user.role === "Approver") },
    { id: "compare", label: "Compare vs. source", show: !!assessment.sourceAssessmentId },
    { id: "export", label: "Export", show: assessment.state !== "Draft" },
  ];

  function handleSubmit() {
    const result = submitForApproval(assessment!.id);
    if (!result.ok) setSubmitError(result.reason ?? "Could not submit.");
    else setSubmitError(null);
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <SectionHeading
          eyebrow={`Assessment v${assessment.version}${assessment.sourceAssessmentId ? " (refresh)" : ""}`}
          title={customer.name}
          dek={`${assessment.periods.join(", ") || "no periods yet"} · prepared by ${assessment.createdBy} · ${formatDate(assessment.createdAt)}`}
        />
        <div className="flex flex-col items-end gap-2">
          <Link to={`/customers/${customer.id}`} className="text-sm text-[var(--accent-deep)] hover:underline">
            ← {customer.name}
          </Link>
          <AssessmentStateBadge state={assessment.state} returned={returned} />
        </div>
      </div>

      {returned && returnComment && (
        <Card className="mb-4 border-[var(--v2)]">
          <p className="text-sm">
            <span className="font-semibold text-[var(--v2)]">Returned for revision:</span> "{returnComment}"
          </p>
        </Card>
      )}

      <div className="flex gap-1 mb-6 border-b border-[var(--line)]">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? "border-[var(--accent)] text-[var(--accent-deep)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === "upload" && editable && <DocumentUploadPanel assessment={assessment} />}
      {tab === "review" && <FieldReviewPanel assessment={assessment} editable={editable} />}
      {tab === "results" && <ResultsPanel assessment={assessment} editable={editable} />}
      {tab === "approval" && <ApprovalPanel assessment={assessment} />}
      {tab === "compare" && assessment.sourceAssessmentId && <ComparisonPanel assessment={assessment} />}
      {tab === "export" && <ExportPanel assessment={assessment} />}

      {editable && (
        <Card className="mt-6 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-mono text-[var(--muted)]">
              {progress.reviewed}/{progress.total} review items
            </span>
            {provisionalCount > 0 && (
              <span className="ml-3">
                <Badge tone="med">{provisionalCount} Provisional ratio{provisionalCount === 1 ? "" : "s"} blocking submission (FR3.10)</Badge>
              </span>
            )}
            {submitError && <p className="text-[var(--crit)] mt-1">{submitError}</p>}
          </div>
          <Button onClick={handleSubmit}>Submit for approval</Button>
        </Card>
      )}
    </div>
  );
}
