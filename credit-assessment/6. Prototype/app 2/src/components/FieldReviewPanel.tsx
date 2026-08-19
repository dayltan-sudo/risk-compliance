import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { reviewProgress } from "../store/selectors";
import { Card, SectionHeading, Button } from "./Card";
import { ConfidenceBadge, FieldStatusBadge } from "./Badge";
import { STANDARD_FIELDS } from "../data/config";
import { formatCurrency } from "../utils/format";
import type { Assessment, StatementSection } from "../types";

const SECTIONS: StatementSection[] = ["Balance Sheet", "Income Statement", "Cash Flow"];

export function FieldReviewPanel({ assessment, editable }: { assessment: Assessment; editable: boolean }) {
  const allFields = useStore((s) => s.extractedFields);
  const config = useStore((s) => s.config);
  const confirmField = useStore((s) => s.confirmField);
  const amendField = useStore((s) => s.amendField);
  const markNotPresent = useStore((s) => s.markNotPresent);
  const bulkConfirmHigh = useStore((s) => s.bulkConfirmHigh);

  const fields = useMemo(() => allFields.filter((f) => f.assessmentId === assessment.id), [allFields, assessment.id]);
  const periods = assessment.periods;
  const progress = reviewProgress(fields, assessment.id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const [amendValue, setAmendValue] = useState("");
  const [amendReason, setAmendReason] = useState("");

  useEffect(() => {
    setAmendValue(selected?.value !== null && selected?.value !== undefined ? String(selected.value) : "");
    setAmendReason("");
  }, [selectedId]);

  if (periods.length === 0) {
    return (
      <Card>
        <p className="text-[var(--muted)]">Upload at least one document before reviewing fields.</p>
      </Card>
    );
  }

  const highEligible = fields.filter((f) => f.status === "Unconfirmed" && (f.confidenceScore ?? 0) >= config.confidenceThresholds.high).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <SectionHeading eyebrow="FR3 — Core GUI requirement" title="Field Review & Confirmation" />
            {editable && (
              <Button onClick={() => bulkConfirmHigh(assessment.id)} disabled={highEligible === 0} variant="secondary">
                Bulk-confirm {highEligible} High-confidence item{highEligible === 1 ? "" : "s"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-2 bg-[var(--line)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progress.pct}%` }} />
            </div>
            <span className="font-mono text-xs text-[var(--muted)] whitespace-nowrap">
              {progress.reviewed} / {progress.total} review items (FR3.9)
            </span>
          </div>
          <p className="text-xs text-[var(--muted)]">One review item per field-period cell. Not Present counts as reviewed — it's a completed outcome, not a gap.</p>
        </Card>

        {SECTIONS.map((section) => {
          const sectionFieldNames = STANDARD_FIELDS.filter((f) => f.section === section).map((f) => f.name);
          const presentNames = sectionFieldNames.filter((name) => fields.some((f) => f.fieldName === name));
          if (presentNames.length === 0) return null;
          return (
            <Card key={section} className="overflow-x-auto">
              <h3 className="font-semibold text-sm mb-3">{section}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-[var(--line)]">
                    <th className="py-2 pr-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">Field</th>
                    {periods.map((p) => (
                      <th key={p} className="py-2 px-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {presentNames.map((name) => (
                    <tr key={name} className="border-b border-[var(--line)] last:border-0">
                      <td className="py-2 pr-3 font-medium whitespace-nowrap">{name}</td>
                      {periods.map((p) => {
                        const f = fields.find((x) => x.fieldName === name && x.period === p);
                        if (!f) return <td key={p} className="py-2 px-3 text-[var(--muted)]">—</td>;
                        const isSelected = f.id === selectedId;
                        return (
                          <td key={p} className="py-2 px-3">
                            <button
                              onClick={() => setSelectedId(f.id)}
                              className={`w-full text-left rounded-lg px-2 py-1.5 border transition-colors ${
                                isSelected ? "border-[var(--accent)] bg-[var(--accent-tint)]" : "border-transparent hover:border-[var(--line)]"
                              }`}
                            >
                              <div className="font-mono text-[13px]">{f.status === "Not Present" ? "n/a" : formatCurrency(f.value)}</div>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                <FieldStatusBadge status={f.status} />
                                {f.status !== "Not Present" && <ConfidenceBadge score={f.confidenceScore} thresholds={config.confidenceThresholds} />}
                              </div>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>

      <div className="lg:sticky lg:top-6 self-start">
        <Card>
          <SectionHeading eyebrow="FR3.3" title="Source document viewer" dek="Jumps to the exact location the value was extracted from." />
          {!selected && <p className="text-sm text-[var(--muted)]">Select a field to review it against its source.</p>}
          {selected && (
            <div className="space-y-4">
              <div>
                <div className="font-semibold">{selected.fieldName}</div>
                <div className="text-xs text-[var(--muted)]">{selected.period}</div>
              </div>

              <div className="bg-[var(--paper)] border border-dashed border-[var(--line)] rounded-lg p-4 text-xs font-mono text-[var(--muted)]">
                📄 {selected.sourcePointer}
                <div className="mt-2 text-[var(--ink)]">Extraction model: {selected.extractionModelVersion}</div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <FieldStatusBadge status={selected.status} />
                {selected.status !== "Not Present" && <ConfidenceBadge score={selected.confidenceScore} thresholds={config.confidenceThresholds} />}
              </div>

              <div className="text-sm">
                <span className="text-[var(--muted)]">Extracted value: </span>
                <span className="font-mono">{formatCurrency(selected.originalExtractedValue)}</span>
              </div>

              {editable && selected.status !== "Not Present" && (
                <div className="flex gap-2 flex-wrap">
                  {selected.status === "Unconfirmed" && (
                    <Button onClick={() => confirmField(selected.id)}>Confirm</Button>
                  )}
                  <Button variant="secondary" onClick={() => markNotPresent(selected.id)}>
                    Mark Not Present
                  </Button>
                </div>
              )}

              {editable && (
                <div className="border-t border-[var(--line)] pt-3">
                  <label className="block text-xs font-medium mb-1">Amend value</label>
                  <input
                    value={amendValue}
                    onChange={(e) => setAmendValue(e.target.value)}
                    type="number"
                    className="w-full border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--paper)] mb-2"
                  />
                  <label className="block text-xs font-medium mb-1">Reason (optional)</label>
                  <input
                    value={amendReason}
                    onChange={(e) => setAmendReason(e.target.value)}
                    placeholder="e.g. restated per FY2025 note 4"
                    className="w-full border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--paper)] mb-2"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const v = Number(amendValue);
                      if (!Number.isNaN(v)) amendField(selected.id, v, amendReason);
                    }}
                  >
                    Save amendment
                  </Button>
                </div>
              )}

              {selected.amendmentHistory.length > 0 && (
                <div className="border-t border-[var(--line)] pt-3">
                  <div className="text-xs font-semibold mb-2">Amendment history</div>
                  <ul className="space-y-2">
                    {selected.amendmentHistory.map((h, i) => (
                      <li key={i} className="text-xs text-[var(--muted)] font-mono">
                        {h.previousStatus} ({formatCurrency(h.previousValue)}) → {h.newStatus} ({formatCurrency(h.newValue)}) by {h.actor}
                        {h.reason ? ` — "${h.reason}"` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
