import type { AssessmentState, ConfidenceBand, FieldStatus, RecencyFlag } from "../types.js";

type Tone = "low" | "med" | "high" | "crit" | "mvp" | "v2" | "neutral" | "accent";

const TONE_CLASSES: Record<Tone, string> = {
  low: "bg-[var(--low-bg)] text-[var(--low)] ring-1 ring-inset ring-[var(--low)]/15",
  med: "bg-[var(--med-bg)] text-[var(--med)] ring-1 ring-inset ring-[var(--med)]/15",
  high: "bg-[var(--high-bg)] text-[var(--high)] ring-1 ring-inset ring-[var(--high)]/15",
  crit: "bg-[var(--crit-bg)] text-[var(--crit)] ring-1 ring-inset ring-[var(--crit)]/15",
  mvp: "bg-[var(--v-mvp-bg)] text-[var(--v-mvp)] ring-1 ring-inset ring-[var(--v-mvp)]/15",
  v2: "bg-[var(--v2-bg)] text-[var(--v2)] ring-1 ring-inset ring-[var(--v2)]/15",
  neutral: "bg-[var(--paper)] text-[var(--muted)] ring-1 ring-inset ring-[var(--line-strong)]",
  accent: "bg-[var(--accent-tint)] text-[var(--accent-deep)] ring-1 ring-inset ring-[var(--accent)]/15",
};

export function Badge({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function confidenceBand(score: number | null, thresholds: { high: number; medium: number }): ConfidenceBand | null {
  if (score === null) return null;
  if (score >= thresholds.high) return "High";
  if (score >= thresholds.medium) return "Medium";
  return "Low";
}

export function ConfidenceBadge({ score, thresholds }: { score: number | null; thresholds: { high: number; medium: number } }) {
  const band = confidenceBand(score, thresholds);
  if (band === null) return <Badge tone="neutral">n/a</Badge>;
  const tone: Tone = band === "High" ? "low" : band === "Medium" ? "med" : "crit";
  return (
    <Badge tone={tone} title={`Confidence band: ${band}`}>
      {score}% {band}
    </Badge>
  );
}

export function FieldStatusBadge({ status }: { status: FieldStatus }) {
  if (status === "Confirmed") return <Badge tone="low">Confirmed</Badge>;
  if (status === "Amended") return <Badge tone="accent">Amended</Badge>;
  return <Badge tone="med">Unconfirmed</Badge>;
}

export function AssessmentStateBadge({ state, returned }: { state: AssessmentState; returned?: boolean }) {
  if (returned && state === "Draft") return <Badge tone="v2">Returned for Revision</Badge>;
  if (state === "Draft") return <Badge tone="neutral">Draft</Badge>;
  if (state === "Submitted") return <Badge tone="med">Submitted</Badge>;
  if (state === "Approved") return <Badge tone="low">Approved</Badge>;
  return <Badge tone="crit">Rejected</Badge>;
}

export function RecencyBadge({ flag }: { flag: RecencyFlag | null }) {
  if (flag === null) return null;
  if (flag === "Non-Recent") return <Badge tone="med" title="Latest statement's financials date is over 540 days old. Advisory only — no effect on any tier, ratio, or score.">Non-Recent statement</Badge>;
  return <Badge tone="low" title="Advisory only">Recent statement</Badge>;
}

export function ModelGeneratedBadge() {
  return <Badge tone="v2" title="Risk Commentary — advisory, cited, never changes the score">Model-generated</Badge>;
}

export function IntegrityCheckBadge({ passed }: { passed: boolean }) {
  return passed ? <Badge tone="low">Pass</Badge> : <Badge tone="crit">Fail</Badge>;
}
