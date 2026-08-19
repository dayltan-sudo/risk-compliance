import { useState } from "react";
import { useStore } from "../store/useStore";
import { Card, SectionHeading, Button } from "./Card";
import { Badge } from "./Badge";
import { formatDate } from "../utils/format";
import type { Assessment } from "../types";

export function DocumentUploadPanel({ assessment }: { assessment: Assessment }) {
  const documents = useStore((s) => s.documents);
  const uploadDocument = useStore((s) => s.uploadDocument);
  const [period, setPeriod] = useState("FY2026");
  const [type, setType] = useState<"audited" | "unaudited">("unaudited");
  const [fileName, setFileName] = useState("");

  const assessmentDocs = documents.filter((d) => d.referencedByAssessmentIds.includes(assessment.id));
  const alreadyCovered = new Set(assessmentDocs.map((d) => d.period));

  function handleUpload() {
    const name = fileName.trim() || `${period}_statement.pdf`;
    uploadDocument({ customerId: assessment.customerId, assessmentId: assessment.id, period, type, fileName: name });
    setFileName("");
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeading
          eyebrow="FR1"
          title="Upload financial statements"
          dek="PDF, scanned image, Excel, or Word — this prototype mocks extraction rather than accepting a real file. Re-uploading a period creates a new version (FR1.5); it never overwrites."
        />
        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium mb-1">Period</label>
            <input value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Statement type (FR1.2, uploader-supplied)</label>
            <select value={type} onChange={(e) => setType(e.target.value as "audited" | "unaudited")} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]">
              <option value="audited">Audited</option>
              <option value="unaudited">Unaudited / management accounts</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">File name</label>
            <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={`${period}_statement.pdf`} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]" />
          </div>
        </div>
        {alreadyCovered.has(period) && (
          <p className="text-xs text-[var(--med)] mt-2">A document for {period} already exists on this assessment — uploading creates a new version (FR1.5).</p>
        )}
        <div className="mt-4">
          <Button onClick={handleUpload}>Upload & extract</Button>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Documents on this assessment" dek="Financial-statement documents attach to the customer and are reused by reference across assessments (FR1.6)." />
        <ul className="divide-y divide-[var(--line)]">
          {assessmentDocs.map((d) => (
            <li key={d.id} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{d.fileName}</div>
                <div className="text-xs text-[var(--muted)] font-mono">
                  {d.period} · {d.type} · v{d.version} · uploaded {formatDate(d.uploadDate)} by {d.uploader}
                </div>
              </div>
              {d.referencedByAssessmentIds.length > 1 && <Badge tone="accent">reused across {d.referencedByAssessmentIds.length} assessments</Badge>}
            </li>
          ))}
          {assessmentDocs.length === 0 && <li className="py-3 text-sm text-[var(--muted)]">No documents yet — upload at least one period above.</li>}
        </ul>
      </Card>
    </div>
  );
}
