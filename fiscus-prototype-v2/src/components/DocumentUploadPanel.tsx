import { useState } from "react";
import { useStore } from "../store/useStore.js";
import { Card, SectionHeading, Button } from "./Card.js";
import { useAgentActivity } from "../hooks/useAgentActivity.js";
import { formatDate } from "../utils/format.js";
import type { Assessment, DocumentType, StatementBasis } from "../types.js";

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
      <path d="M6 10.5 8.5 13 14 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type UploadPhase = "idle" | "uploading" | "done";

export function DocumentUploadPanel({ assessment, onGoToReview }: { assessment: Assessment; onGoToReview?: () => void }) {
  const documents = useStore((s) => s.documents);
  const uploadDocument = useStore((s) => s.uploadDocument);
  const agents = useAgentActivity(assessment.id);
  const extraction = agents?.find((a) => a.agentType === "extraction");

  const [type, setType] = useState<DocumentType>("unaudited");
  const [statementBasis, setStatementBasis] = useState<StatementBasis>("standalone");
  const [file, setFile] = useState<File | null>(null);
  const [registryFile, setRegistryFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");

  const assessmentDocs = documents.filter((d) => d.assessmentId === assessment.id);
  const hasRegistry = assessmentDocs.some((d) => d.type === "registry");

  async function handleUpload() {
    if (!file) return setError("Choose a file to upload.");
    setPhase("uploading");
    setError(null);
    const result = await uploadDocument({ assessmentId: assessment.id, type, statementBasis, file });
    if (!result.ok) {
      setPhase("idle");
      return setError(result.reason ?? "Upload failed.");
    }
    setPhase("done");
    setFile(null);
  }

  async function handleRegistryUpload() {
    if (!registryFile) return setError("Choose a file to upload.");
    const result = await uploadDocument({ assessmentId: assessment.id, type: "registry", file: registryFile });
    if (!result.ok) return setError(result.reason ?? "Upload failed.");
    setError(null);
    setRegistryFile(null);
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeading
          title="Upload financial statements"
          dek="Exactly two fiscal periods — current and prior. The model reads the statement to determine its period, financials date, currency, and scale; re-uploading a period creates a new version; it never overwrites."
        />
        <div className="grid grid-cols-3 gap-3 items-end mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">Statement type</label>
            <select value={type} onChange={(e) => setType(e.target.value as DocumentType)} className="w-full field">
              <option value="audited">Audited</option>
              <option value="unaudited">Unaudited / management accounts</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Statement basis</label>
            <select value={statementBasis} onChange={(e) => setStatementBasis(e.target.value as StatementBasis)} className="w-full field">
              <option value="standalone">Standalone</option>
              <option value="consolidated">Consolidated</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">File (PDF, image, Excel, or Word)</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPhase("idle");
                setError(null);
              }}
              className="w-full field"
            />
          </div>
        </div>
        {assessment.periods.length >= 2 && (
          <p className="text-xs text-[var(--muted)] mb-2">
            This assessment already has two periods ({assessment.periods.join(", ")}) — a statement for a third, different period will be rejected.
          </p>
        )}
        {error && <p className="text-xs text-[var(--crit)] mb-2">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={handleUpload} disabled={phase === "uploading"}>
            {phase === "uploading" ? "Uploading…" : "Upload & extract"}
          </Button>
          {phase === "uploading" && (
            <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Spinner />
              {extraction?.status === "running" && extraction.detail ? extraction.detail : "Extracting…"}
            </span>
          )}
          {phase === "done" && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--low)] font-medium">
              <CheckIcon className="h-5 w-5" />
              Uploaded
            </span>
          )}
        </div>
        {phase === "done" && (
          <div className="mt-3 rounded-lg border border-[var(--low)]/25 bg-[var(--low-bg)] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-[var(--low)]">
              <span className="font-semibold">Extraction complete.</span>{" "}
              {extraction?.status === "done" && extraction.detail ? extraction.detail : "The statement has been read and its fields extracted."}
            </p>
            {onGoToReview && (
              <Button variant="secondary" className="shrink-0" onClick={onGoToReview}>
                Review fields →
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card>
        <SectionHeading title="ACRA registry document (optional)" dek="Not mandatory — an assessment without one is complete and scoreable. When present, it governs criterion 5's paid-up capital prefill." />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1">File</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setRegistryFile(e.target.files?.[0] ?? null)}
              className="w-full field"
            />
          </div>
          <Button variant="secondary" onClick={handleRegistryUpload} disabled={hasRegistry}>
            {hasRegistry ? "Already uploaded" : "Upload registry document"}
          </Button>
          {hasRegistry && <CheckIcon className="h-5 w-5 text-[var(--low)] shrink-0" />}
        </div>
      </Card>

      <Card>
        <SectionHeading title="Documents on this assessment" />
        <ul className="divide-y divide-[var(--line)]">
          {assessmentDocs.map((d) => (
            <li key={d.id} className="py-3">
              <div className="font-medium text-sm">{d.fileName}</div>
              <div className="text-xs text-[var(--muted)] font-mono mt-0.5">
                {d.type}{d.period ? ` · ${d.period}` : ""} · v{d.version} · uploaded {formatDate(d.uploadDate)} by {d.uploader}
                {d.financialsDate && ` · financials as at ${formatDate(d.financialsDate)}`}
              </div>
            </li>
          ))}
          {assessmentDocs.length === 0 && <li className="py-3 text-sm text-[var(--muted)]">No documents yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
