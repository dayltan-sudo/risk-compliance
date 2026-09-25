import { useState } from "react";
import { useStore } from "../store/useStore";
import { Card, SectionHeading, Button } from "./Card";
import { PRESENTATION_SCALES } from "../data/config";
import { formatDate } from "../utils/format";
import type { Assessment, DocumentType, PresentationScale, StatementBasis } from "../types";

export function DocumentUploadPanel({ assessment }: { assessment: Assessment }) {
  const documents = useStore((s) => s.documents);
  const uploadDocument = useStore((s) => s.uploadDocument);

  const [period, setPeriod] = useState("FY2027");
  const [type, setType] = useState<DocumentType>("unaudited");
  const [financialsDate, setFinancialsDate] = useState("2027-01-01");
  const [presentationCurrency, setPresentationCurrency] = useState("SGD");
  const [presentationScale, setPresentationScale] = useState<PresentationScale>("units");
  const [statementBasis, setStatementBasis] = useState<StatementBasis>("standalone");
  const [fileName, setFileName] = useState("");
  const [registryFileName, setRegistryFileName] = useState("");

  const assessmentDocs = documents.filter((d) => d.assessmentId === assessment.id);
  const alreadyCovered = new Set(assessmentDocs.map((d) => d.period));
  const hasRegistry = assessmentDocs.some((d) => d.type === "registry");

  function handleUpload() {
    if (assessment.periods.length >= 2 && !assessment.periods.includes(period)) return;
    const name = fileName.trim() || `${period}_statement.pdf`;
    uploadDocument({ assessmentId: assessment.id, type, period, financialsDate, presentationCurrency, presentationScale, statementBasis, fileName: name });
    setFileName("");
  }

  function handleRegistryUpload() {
    const name = registryFileName.trim() || "ACRA_Bizfile.pdf";
    uploadDocument({ assessmentId: assessment.id, type: "registry", fileName: name });
    setRegistryFileName("");
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeading
          eyebrow="FR1.1–FR1.5"
          title="Upload financial statements"
          dek="Exactly two fiscal periods — current and prior (FR1.3). This prototype mocks extraction rather than accepting a real file. Re-uploading a period creates a new version; it never overwrites."
        />
        <div className="grid grid-cols-3 gap-3 items-end mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">Period</label>
            <input value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Statement type (FR1.2, uploader-supplied)</label>
            <select value={type} onChange={(e) => setType(e.target.value as DocumentType)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]">
              <option value="audited">Audited</option>
              <option value="unaudited">Unaudited / management accounts</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">File name</label>
            <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={`${period}_statement.pdf`} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Financials date</label>
            <input type="date" value={financialsDate} onChange={(e) => setFinancialsDate(e.target.value)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Presentation currency</label>
            <input value={presentationCurrency} onChange={(e) => setPresentationCurrency(e.target.value)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Presentation scale</label>
            <select value={presentationScale} onChange={(e) => setPresentationScale(e.target.value as PresentationScale)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]">
              {PRESENTATION_SCALES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Statement basis</label>
            <select value={statementBasis} onChange={(e) => setStatementBasis(e.target.value as StatementBasis)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]">
              <option value="standalone">Standalone</option>
              <option value="consolidated">Consolidated</option>
            </select>
          </div>
        </div>
        {alreadyCovered.has(period) && (
          <p className="text-xs text-[var(--med)] mb-2">A document for {period} already exists on this assessment — uploading creates a new version (FR1.5).</p>
        )}
        {assessment.periods.length >= 2 && !alreadyCovered.has(period) && (
          <p className="text-xs text-[var(--crit)] mb-2">This assessment already has two periods ({assessment.periods.join(", ")}) — FR1.3 caps at exactly two.</p>
        )}
        <Button onClick={handleUpload} disabled={assessment.periods.length >= 2 && !alreadyCovered.has(period)}>
          Upload & extract
        </Button>
      </Card>

      <Card>
        <SectionHeading eyebrow="FR1.6" title="ACRA registry document (optional)" dek="Not mandatory — an assessment without one is complete and scoreable. When present, it governs criterion 5's paid-up capital prefill (FR5.8)." />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1">File name</label>
            <input value={registryFileName} onChange={(e) => setRegistryFileName(e.target.value)} placeholder="ACRA_Bizfile.pdf" className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]" />
          </div>
          <Button variant="secondary" onClick={handleRegistryUpload} disabled={hasRegistry}>
            {hasRegistry ? "Already uploaded" : "Upload registry document"}
          </Button>
        </div>
      </Card>

      <Card>
        <SectionHeading eyebrow="FR1.5" title="Documents on this assessment" dek="Re-uploading a period adds a new version; the prior version is kept, never overwritten, and its fields drop out of review." />
        <ul className="divide-y divide-[var(--line)]">
          {[...assessmentDocs]
            .sort((a, b) => (a.period ?? "").localeCompare(b.period ?? "") || b.version - a.version)
            .map((d) => {
              const isSuperseded = assessmentDocs.some((other) => other.supersedesDocumentId === d.id);
              return (
                <li key={d.id} className="py-3">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {d.fileName}
                    {isSuperseded && <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--muted)] border border-[var(--line)] rounded-full px-2 py-0.5">Superseded</span>}
                  </div>
                  <div className="text-xs text-[var(--muted)] font-mono mt-0.5">
                    {d.type}{d.period ? ` · ${d.period}` : ""} · v{d.version} · uploaded {formatDate(d.uploadDate)} by {d.uploader}
                    {d.financialsDate && ` · financials as at ${formatDate(d.financialsDate)}`}
                    {d.supersedesDocumentId && ` · supersedes ${d.supersedesDocumentId}`}
                  </div>
                </li>
              );
            })}
          {assessmentDocs.length === 0 && <li className="py-3 text-sm text-[var(--muted)]">No documents yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
