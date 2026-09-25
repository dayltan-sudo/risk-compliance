import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore.js";
import { reviewProgress } from "../store/selectors.js";
import { fieldPeriodChange } from "../engine/ratios.js";
import { Card, SectionHeading, Button } from "./Card.js";
import { ConfidenceBadge, FieldStatusBadge, IntegrityCheckBadge, RecencyBadge } from "./Badge.js";
import { CONFIDENCE_THRESHOLDS, FIELD_DEFS } from "../data/config.js";
import { formatCurrency, formatChangePct } from "../utils/format.js";
import type { Assessment, IntegrityCheckName, StatementSection } from "../types.js";

const SECTIONS: StatementSection[] = ["Balance Sheet", "Income Statement", "Cash Flow"];

const CHECK_LABELS: Record<IntegrityCheckName, string> = {
  npat_le_sales: "NPAT ≤ Sales",
  cash_le_current_assets: "Cash ≤ Current Assets",
  current_assets_le_total_assets: "Current Assets ≤ Total Assets",
  non_current_assets_le_total_assets: "Non-Current Assets ≤ Total Assets",
  current_liabilities_le_total_liabilities: "Current Liabilities ≤ Total Liabilities",
  non_current_liabilities_le_total_liabilities: "Non-Current Liabilities ≤ Total Liabilities",
  total_assets_eq_ca_plus_nca: "Total Assets = Current Assets + Non-Current Assets",
  total_liabilities_eq_cl_plus_ncl: "Total Liabilities = Current Liabilities + Non-Current Liabilities",
  equity_plus_liabilities_eq_assets: "Total Equity + Total Liabilities = Total Assets",
};

export function FieldReviewPanel({ assessment, editable }: { assessment: Assessment; editable: boolean }) {
  const allFields = useStore((s) => s.extractedFields);
  const allCriterionInputs = useStore((s) => s.criterionInputs);
  const allChecks = useStore((s) => s.integrityChecks);
  const confirmField = useStore((s) => s.confirmField);
  const amendField = useStore((s) => s.amendField);
  const bulkConfirmHigh = useStore((s) => s.bulkConfirmHigh);

  const fields = useMemo(() => allFields.filter((f) => f.assessmentId === assessment.id), [allFields, assessment.id]);
  const criterionInputs = useMemo(() => allCriterionInputs.filter((c) => c.assessmentId === assessment.id), [allCriterionInputs, assessment.id]);
  const checks = useMemo(() => allChecks.filter((c) => c.assessmentId === assessment.id), [allChecks, assessment.id]);
  const periods = assessment.periods;
  const progress = reviewProgress(fields, criterionInputs, assessment.id, assessment.relationshipType);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const selectedDef = selected ? FIELD_DEFS.find((d) => d.name === selected.fieldName) : undefined;
  const [amendValue, setAmendValue] = useState("");
  const [amendBoolValue, setAmendBoolValue] = useState(true);
  const [amendReason, setAmendReason] = useState("");

  useEffect(() => {
    if (selected && typeof selected.value === "boolean") setAmendBoolValue(selected.value);
    setAmendValue(typeof selected?.value === "number" ? String(selected.value) : "");
    setAmendReason("");
  }, [selectedId]);

  if (periods.length === 0) {
    return (
      <Card>
        <p className="text-[var(--muted)]">Upload at least one document before reviewing fields.</p>
      </Card>
    );
  }

  const highEligible = fields.filter((f) => f.status === "Unconfirmed" && (f.confidenceScore ?? 0) >= CONFIDENCE_THRESHOLDS.high).length;
  const currentPeriod = periods[periods.length - 1];
  const priorPeriod = periods[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <SectionHeading title="Field Review & Confirmation" />
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
              {progress.reviewed} / {progress.total} review items
            </span>
          </div>
          <div className="flex items-center gap-2">
            <RecencyBadge flag={assessment.recencyFlag} />
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">One review item per field-period cell, plus one per applicable criterion input. Nothing computes until every item is Confirmed or Amended.</p>
        </Card>

        {SECTIONS.map((section) => {
          const sectionFieldNames = FIELD_DEFS.filter((f) => f.section === section).map((f) => f.name);
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
                        const displayValue = typeof f.value === "boolean" ? (f.value ? "Yes" : "No") : f.status === "Confirmed" && f.value === null ? "confirmed absent" : formatCurrency(f.value as number | null, f.currency ?? "SGD");
                        return (
                          <td key={p} className="py-2 px-3">
                            <button
                              onClick={() => setSelectedId(f.id)}
                              className={`w-full text-left rounded-lg px-2 py-1.5 border transition-colors ${
                                isSelected ? "border-[var(--accent)] bg-[var(--accent-tint)]" : "border-transparent hover:border-[var(--line)]"
                              }`}
                            >
                              <div className="font-mono text-[13px]">{displayValue}</div>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                <FieldStatusBadge status={f.status} />
                                <ConfidenceBadge score={f.confidenceScore} thresholds={CONFIDENCE_THRESHOLDS} />
                                {f.scaleApplied && f.scaleApplied !== "units" && <span className="text-[10px] font-mono text-[var(--muted)]">({f.scaleApplied})</span>}
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

        <Card>
          <SectionHeading title="Integrity checks" dek="Six inequalities, exact. Three equalities, within 0.1% of Total Assets. A failure never blocks computation — it directs attention." />
          {periods.map((period) => {
            const periodChecks = checks.filter((c) => c.period === period);
            if (periodChecks.length === 0) return null;
            return (
              <div key={period} className="mb-4 last:mb-0">
                <h4 className="text-xs font-mono uppercase tracking-wide text-[var(--muted)] mb-2">{period}</h4>
                <ul className="space-y-2">
                  {periodChecks.map((c) => (
                    <li key={c.id} className="text-sm border-b border-[var(--line)] pb-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <IntegrityCheckBadge passed={c.passed} />
                        <span>{CHECK_LABELS[c.checkName]}</span>
                      </div>
                      {!c.passed && (
                        <div className="mt-1 pl-1 text-xs text-[var(--muted)] font-mono">
                          <div>
                            Signed difference (expected − actual): {c.difference !== null ? c.difference.toLocaleString() : "—"}
                            {c.toleranceApplied !== null && ` · tolerance ${c.toleranceApplied.toLocaleString()}`}
                          </div>
                          {c.operandMovementRanking && c.operandMovementRanking.length > 0 ? (
                            <div>
                              Ranked by period-over-period movement: {c.operandMovementRanking.map((m) => `${m.fieldName} (${formatChangePct(m.changePct)})`).join(" > ")}
                            </div>
                          ) : (
                            <div>Movement ranking unavailable — every operand lacks a prior-period value.</div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {checks.length === 0 && <p className="text-sm text-[var(--muted)]">No checks evaluated yet.</p>}
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 self-start">
        <Card>
          <SectionHeading title="Source document viewer" dek="Jumps to the exact location the value was extracted from." />
          {!selected && <p className="text-sm text-[var(--muted)]">Select a field to review it against its source.</p>}
          {selected && (
            <div className="space-y-4">
              <div>
                <div className="font-semibold">{selected.fieldName}</div>
                <div className="text-xs text-[var(--muted)]">
                  {selected.period}
                  {selected.period === currentPeriod && priorPeriod !== currentPeriod && selectedDef?.valueType === "amount" && (
                    <span> · change vs {priorPeriod}: {formatChangePct(fieldPeriodChange(fields, selected.fieldName, currentPeriod, priorPeriod))}</span>
                  )}
                </div>
              </div>

              <div className="bg-[var(--paper)] border border-dashed border-[var(--line)] rounded-lg p-4 text-xs font-mono text-[var(--muted)]">
                📄 {selected.sourcePointer}
                <div className="mt-2 text-[var(--ink)]">Extraction model: {selected.extractionModelVersion}</div>
                {selected.scaleApplied && <div className="text-[var(--ink)]">Scale: {selected.scaleApplied} · Currency: {selected.currency}</div>}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <FieldStatusBadge status={selected.status} />
                <ConfidenceBadge score={selected.confidenceScore} thresholds={CONFIDENCE_THRESHOLDS} />
              </div>

              <div className="text-sm">
                <span className="text-[var(--muted)]">Extracted value: </span>
                <span className="font-mono">{typeof selected.originalExtractedValue === "boolean" ? (selected.originalExtractedValue ? "Yes" : "No") : formatCurrency(selected.originalExtractedValue as number | null, selected.currency ?? "SGD")}</span>
              </div>

              {editable && selected.status === "Unconfirmed" && (
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => confirmField(selected.id)}>Confirm as extracted</Button>
                  <Button variant="secondary" onClick={() => confirmField(selected.id, null)} title="Asserts the line item is genuinely absent from the source">
                    Confirm absent
                  </Button>
                </div>
              )}

              {editable && (
                <div className="border-t border-[var(--line)] pt-3">
                  <label className="block text-xs font-medium mb-1">Amend value</label>
                  {selectedDef?.valueType === "boolean" ? (
                    <select value={amendBoolValue ? "yes" : "no"} onChange={(e) => setAmendBoolValue(e.target.value === "yes")} className="w-full field mb-2">
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <input
                      value={amendValue}
                      onChange={(e) => setAmendValue(e.target.value)}
                      type="number"
                      className="w-full field mb-2"
                    />
                  )}
                  <label className="block text-xs font-medium mb-1">Reason (optional)</label>
                  <input
                    value={amendReason}
                    onChange={(e) => setAmendReason(e.target.value)}
                    placeholder="e.g. restated per FY2026 note 4"
                    className="w-full field mb-2"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (selectedDef?.valueType === "boolean") amendField(selected.id, amendBoolValue, amendReason);
                      else {
                        const v = Number(amendValue);
                        if (!Number.isNaN(v)) amendField(selected.id, v, amendReason);
                      }
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
                        {h.previousStatus} ({String(h.previousValue)}) → {h.newStatus} ({String(h.newValue)}) by {h.actor}
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
