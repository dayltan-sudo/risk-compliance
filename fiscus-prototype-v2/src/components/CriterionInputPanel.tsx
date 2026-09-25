import { useState } from "react";
import { useStore } from "../store/useStore.js";
import { Card, SectionHeading, Button } from "./Card.js";
import { Badge } from "./Badge.js";
import type { Assessment, CriterionInput, LitigationRecord, PromptPaymentRecord } from "../types.js";

function CriterionCard({
  title,
  eyebrow,
  input,
  editable,
  children,
  onConfirm,
  onAmend,
  error,
}: {
  title: string;
  eyebrow: string;
  input: CriterionInput | undefined;
  editable: boolean;
  children: React.ReactNode;
  onConfirm: () => void;
  onAmend: () => void;
  error?: string | null;
}) {
  const isTerminal = input && input.status !== "Unconfirmed";
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionHeading eyebrow={eyebrow} title={title} />
        {input && <Badge tone={input.status === "Unconfirmed" ? "med" : input.status === "Amended" ? "accent" : "low"}>{input.status}</Badge>}
      </div>
      <div className="space-y-3">{children}</div>
      {error && <p className="text-sm text-[var(--crit)] mt-2">{error}</p>}
      {editable && (
        <div className="mt-3 flex gap-2">
          {!isTerminal && <Button onClick={onConfirm}>Confirm</Button>}
          {isTerminal && (
            <Button variant="secondary" onClick={onAmend}>
              Save amendment
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function CriterionInputPanel({ assessment, editable }: { assessment: Assessment; editable: boolean }) {
  const criterionInputs = useStore((s) => s.criterionInputs).filter((c) => c.assessmentId === assessment.id);
  const confirmCriterionInput = useStore((s) => s.confirmCriterionInput);
  const amendCriterionInput = useStore((s) => s.amendCriterionInput);

  const c5 = criterionInputs.find((c) => c.criterionNumber === 5);
  const c7 = criterionInputs.find((c) => c.criterionNumber === 7);
  const c8 = criterionInputs.find((c) => c.criterionNumber === 8);
  const c9 = criterionInputs.find((c) => c.criterionNumber === 9);
  const c11 = criterionInputs.find((c) => c.criterionNumber === 11);

  const [f5, setF5] = useState({ paidUpCapital: c5?.paidUpCapital?.toString() ?? "", totalExposure: c5?.totalExposure?.toString() ?? "", currency: c5?.currency ?? "SGD" });
  const [f7, setF7] = useState({ yearRegisteredSg: c7?.yearRegisteredSg?.toString() ?? "" });
  const [f8, setF8] = useState({ litigationRecord: (c8?.litigationRecord ?? "Clean") as LitigationRecord, evidenceSource: c8?.evidenceSource ?? "", evidencePeriodOrDate: c8?.evidencePeriodOrDate ?? "" });
  const [f9, setF9] = useState({ changeInDirectors: c9?.changeInDirectors ?? false });
  const [f11, setF11] = useState({ promptPaymentRecord: (c11?.promptPaymentRecord ?? "Good") as PromptPaymentRecord, evidenceSource: c11?.evidenceSource ?? "", evidencePeriodOrDate: c11?.evidencePeriodOrDate ?? "" });

  const [errors, setErrors] = useState<Record<number, string | null>>({});

  async function act(n: 5 | 7 | 8 | 9 | 11, values: Record<string, unknown>, isTerminal: boolean) {
    const result = isTerminal ? await amendCriterionInput(assessment.id, n, values, "Updated via review") : await confirmCriterionInput(assessment.id, n, values);
    setErrors((e) => ({ ...e, [n]: result.ok ? null : (result.reason ?? "Could not save.") }));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--muted)]">Five non-financial criteria. {assessment.relationshipType === "New" ? "Criterion 11 is not collected for New customers." : "This is a Renewal assessment — criterion 11 is required."}</p>

      <CriterionCard
        title="Paid-up Capital Cover"
        eyebrow="Criterion 5"
        input={c5}
        editable={editable}
        error={errors[5]}
        onConfirm={() => act(5, { paidUpCapital: Number(f5.paidUpCapital), totalExposure: Number(f5.totalExposure), currency: f5.currency }, false)}
        onAmend={() => act(5, { paidUpCapital: Number(f5.paidUpCapital), totalExposure: Number(f5.totalExposure), currency: f5.currency }, true)}
      >
        {c5?.source && <p className="text-xs text-[var(--muted)]">Prefill source: {c5.source} {c5.source !== "manual" && "— amending sets source to manual"}</p>}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Paid-up capital</label>
            <input value={f5.paidUpCapital} onChange={(e) => setF5({ ...f5, paidUpCapital: e.target.value })} type="number" disabled={!editable} className="w-full field" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Total exposure</label>
            <input value={f5.totalExposure} onChange={(e) => setF5({ ...f5, totalExposure: e.target.value })} type="number" disabled={!editable} className="w-full field" />
            <p className="text-[10px] text-[var(--muted)] mt-1">Amending this rescores the assessment.</p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Currency</label>
            <input value={f5.currency} onChange={(e) => setF5({ ...f5, currency: e.target.value })} disabled={!editable} className="w-full field" />
          </div>
        </div>
      </CriterionCard>

      <CriterionCard
        title="Years Registered in Singapore"
        eyebrow="Criterion 7"
        input={c7}
        editable={editable}
        error={errors[7]}
        onConfirm={() => act(7, { yearRegisteredSg: Number(f7.yearRegisteredSg) }, false)}
        onAmend={() => act(7, { yearRegisteredSg: Number(f7.yearRegisteredSg) }, true)}
      >
        <div>
          <label className="block text-xs font-medium mb-1">Year first registered to operate in Singapore</label>
          <input value={f7.yearRegisteredSg} onChange={(e) => setF7({ yearRegisteredSg: e.target.value })} type="number" disabled={!editable} className="w-full max-w-[10rem] field" />
        </div>
      </CriterionCard>

      <CriterionCard
        title="Litigation Record"
        eyebrow="Criterion 8"
        input={c8}
        editable={editable}
        error={errors[8]}
        onConfirm={() => act(8, f8, false)}
        onAmend={() => act(8, f8, true)}
      >
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Record</label>
            <select value={f8.litigationRecord} onChange={(e) => setF8({ ...f8, litigationRecord: e.target.value as LitigationRecord })} disabled={!editable} className="w-full field">
              <option>Clean</option>
              <option>Motor suits only</option>
              <option>Other record</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Source searched</label>
            <input value={f8.evidenceSource} onChange={(e) => setF8({ ...f8, evidenceSource: e.target.value })} disabled={!editable} className="w-full field" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Date searched</label>
            <input type="date" value={f8.evidencePeriodOrDate} onChange={(e) => setF8({ ...f8, evidencePeriodOrDate: e.target.value })} disabled={!editable} className="w-full field" />
          </div>
        </div>
        <p className="text-[10px] text-[var(--muted)]">Both evidence fields are required to confirm; neither affects the tier.</p>
      </CriterionCard>

      <CriterionCard
        title="Change in Directors, Last 3 Years"
        eyebrow="Criterion 9"
        input={c9}
        editable={editable}
        error={errors[9]}
        onConfirm={() => act(9, f9, false)}
        onAmend={() => act(9, f9, true)}
      >
        <select value={f9.changeInDirectors ? "yes" : "no"} onChange={(e) => setF9({ changeInDirectors: e.target.value === "yes" })} disabled={!editable} className="w-full max-w-[10rem] field">
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
        <p className="text-[10px] text-[var(--muted)]">A director appointed or resigned only, per the ACRA officer register.</p>
      </CriterionCard>

      {assessment.relationshipType === "Renewal" && (
        <CriterionCard
          title="Prompt Payment Record, Past 1 Year"
          eyebrow="Criterion 11"
          input={c11}
          editable={editable}
          error={errors[11]}
          onConfirm={() => act(11, f11, false)}
          onAmend={() => act(11, f11, true)}
        >
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Record</label>
              <select value={f11.promptPaymentRecord} onChange={(e) => setF11({ ...f11, promptPaymentRecord: e.target.value as PromptPaymentRecord })} disabled={!editable} className="w-full field">
                <option>Good</option>
                <option>Late</option>
                <option>None held</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">System checked</label>
              <input value={f11.evidenceSource} onChange={(e) => setF11({ ...f11, evidenceSource: e.target.value })} disabled={!editable} className="w-full field" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Period covered</label>
              <input value={f11.evidencePeriodOrDate} onChange={(e) => setF11({ ...f11, evidencePeriodOrDate: e.target.value })} disabled={!editable} className="w-full field" />
            </div>
          </div>
          <p className="text-[10px] text-[var(--muted)]">Both evidence fields are required to confirm; neither affects the tier.</p>
        </CriterionCard>
      )}
    </div>
  );
}
