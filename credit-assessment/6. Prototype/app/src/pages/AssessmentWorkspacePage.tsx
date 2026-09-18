import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../store/useStore";
import { isReturnedForRevision, lastReturnComment, reviewProgress } from "../store/selectors";
import { Card, SectionHeading, Button } from "../components/Card";
import { AssessmentStateBadge, Badge } from "../components/Badge";
import { DocumentUploadPanel } from "../components/DocumentUploadPanel";
import { FieldReviewPanel } from "../components/FieldReviewPanel";
import { CriterionInputPanel } from "../components/CriterionInputPanel";
import { ResultsPanel } from "../components/ResultsPanel";
import { RiskCommentaryPanel } from "../components/RiskCommentaryPanel";
import { ApprovalPanel } from "../components/ApprovalPanel";
import { ExportPanel } from "../components/ExportPanel";
import { formatDate } from "../utils/format";
import type { RelationshipType } from "../types";

type Tab = "upload" | "review" | "criteria" | "results" | "commentary" | "approval" | "export";

export function AssessmentWorkspacePage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const customers = useStore((s) => s.customers);
  const assessments = useStore((s) => s.assessments);
  const extractedFields = useStore((s) => s.extractedFields);
  const criterionInputs = useStore((s) => s.criterionInputs);
  const ratings = useStore((s) => s.ratings);
  const approvalDecisions = useStore((s) => s.approvalDecisions);
  const submitForApproval = useStore((s) => s.submitForApproval);
  const overrideRelationshipType = useStore((s) => s.overrideRelationshipType);

  const assessment = assessments.find((a) => a.id === assessmentId);
  const [tab, setTab] = useState<Tab>("review");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  // The workspace component doesn't remount when navigating between
  // assessments (no key change), so local tab state would otherwise carry
  // over — landing on a tab whose button isn't even shown for the new
  // assessment (e.g. Risk Commentary before a Rating exists).
  useEffect(() => {
    setTab("review");
    setSubmitError(null);
    setShowOverride(false);
  }, [assessmentId]);

  if (!assessment) return <p>Assessment not found.</p>;
  const customer = customers.find((c) => c.id === assessment.customerId)!;

  const editable = assessment.state === "Draft";
  const returned = isReturnedForRevision(assessment, approvalDecisions);
  const returnComment = returned ? lastReturnComment(assessment, approvalDecisions) : undefined;
  const progress = reviewProgress(extractedFields, criterionInputs, assessment.id, assessment.relationshipType);
  const hasRating = ratings.some((r) => r.assessmentId === assessment.id);

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "upload", label: "1. Upload Documents", show: editable },
    { id: "review", label: editable ? "2. Review Fields" : "Fields (read-only)", show: true },
    { id: "criteria", label: editable ? "3. Criterion Inputs" : "Criterion Inputs (read-only)", show: true },
    { id: "results", label: "Ratios & Rating", show: true },
    { id: "commentary", label: "Risk Commentary", show: hasRating },
    { id: "approval", label: "Approval", show: assessment.state !== "Draft" },
    { id: "export", label: "Export", show: assessment.state !== "Draft" },
  ];
  const activeTab = tabs.find((t) => t.id === tab)?.show ? tab : "review";

  function handleSubmit() {
    const result = submitForApproval(assessment!.id);
    if (!result.ok) setSubmitError(result.reason ?? "Could not submit.");
    else setSubmitError(null);
  }

  function handleOverride(newValue: RelationshipType) {
    const result = overrideRelationshipType(assessment!.id, newValue, overrideReason);
    if (result.ok) {
      setShowOverride(false);
      setOverrideReason("");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <SectionHeading
          eyebrow={`Assessment v${assessment.version} · ${assessment.division}`}
          title={customer.name}
          dek={`${assessment.periods.join(", ") || "no periods yet"} · prepared by ${assessment.createdBy} · ${formatDate(assessment.createdAt)}`}
        />
        <div className="flex flex-col items-end gap-2">
          <Link to={`/customers/${customer.id}?division=${encodeURIComponent(assessment.division)}`} className="text-sm text-[var(--accent-deep)] hover:underline">
            ← {customer.name}
          </Link>
          <AssessmentStateBadge state={assessment.state} returned={returned} />
          <div className="flex items-center gap-1">
            <Badge tone="neutral" title={assessment.relationshipTypeOverridden ? `Overridden — "${assessment.relationshipTypeOverrideReason}"` : "Derived from (customer, division) Approved history (FR5.13)"}>
              {assessment.relationshipType}
            </Badge>
            {editable && (
              <button onClick={() => setShowOverride((v) => !v)} className="text-[10px] text-[var(--accent-deep)] hover:underline">
                override
              </button>
            )}
          </div>
        </div>
      </div>

      {showOverride && editable && (
        <Card className="mb-4">
          <p className="text-xs text-[var(--muted)] mb-2">Overriding requires a reason (FR5.13). Switching to Renewal resets criterion 11 to Unconfirmed.</p>
          <div className="flex gap-2">
            <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason" className="flex-1 border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--paper)]" />
            <Button variant="secondary" disabled={!overrideReason.trim()} onClick={() => handleOverride(assessment.relationshipType === "New" ? "Renewal" : "New")}>
              Switch to {assessment.relationshipType === "New" ? "Renewal" : "New"}
            </Button>
          </div>
        </Card>
      )}

      {returned && returnComment && (
        <Card className="mb-4 border-[var(--v2)]">
          <p className="text-sm">
            <span className="font-semibold text-[var(--v2)]">Returned for revision:</span> "{returnComment}"
          </p>
        </Card>
      )}

      <div className="flex gap-1 mb-6 border-b border-[var(--line)] overflow-x-auto">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeTab === t.id ? "border-[var(--accent)] text-[var(--accent-deep)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {activeTab === "upload" && editable && <DocumentUploadPanel assessment={assessment} />}
      {activeTab === "review" && <FieldReviewPanel assessment={assessment} editable={editable} />}
      {activeTab === "criteria" && <CriterionInputPanel assessment={assessment} editable={editable} />}
      {activeTab === "results" && <ResultsPanel assessment={assessment} />}
      {activeTab === "commentary" && <RiskCommentaryPanel assessment={assessment} />}
      {activeTab === "approval" && <ApprovalPanel assessment={assessment} />}
      {activeTab === "export" && <ExportPanel assessment={assessment} />}

      {editable && (
        <Card className="mt-6 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-mono text-[var(--muted)]">
              {progress.reviewed}/{progress.total} review items
            </span>
            {progress.reviewed < progress.total && (
              <span className="ml-3">
                <Badge tone="med">Nothing computes until every item is reviewed (FR3.8)</Badge>
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
