import type { AssessmentState, ConfidenceBand, FieldStatus, RecencyFlag } from "../types";

type Tone = "low" | "med" | "high" | "crit" | "mvp" | "v2" | "neutral" | "accent";

const TONE_CLASSES: Record<Tone, string> = {
  low: "bg-[var(--low-bg)] text-[var(--low)]",
  med: "bg-[var(--med-bg)] text-[var(--med)]",
  high: "bg-[var(--high-bg)] text-[var(--high)]",
  crit: "bg-[var(--crit-bg)] text-[var(--crit)]",
  mvp: "bg-[var(--v-mvp-bg)] text-[var(--v-mvp)]",
  v2: "bg-[var(--v2-bg)] text-[var(--v2)]",
  neutral: "bg-[var(--line)] text-[var(--muted)]",
  accent: "bg-[var(--accent-tint)] text-[var(--accent-deep)]",
};

export function Badge({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 font-mono text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${TONE_CLASSES[tone]}`}
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
    <Badge tone={tone} title={`FR2.6 confidence band: ${band}`}>
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
  if (flag === "Non-Recent") return <Badge tone="med" title="Latest statement's financials_date is over 540 days old (FR3.12). Advisory only — no effect on any tier, ratio, or score.">Non-Recent statement</Badge>;
  return <Badge tone="low" title="FR3.12 — advisory only">Recent statement</Badge>;
}

export function ModelGeneratedBadge() {
  return <Badge tone="v2" title="Risk Commentary (FR11) — advisory, cited, never changes the score">Model-generated</Badge>;
}

export function IntegrityCheckBadge({ passed }: { passed: boolean }) {
  return passed ? <Badge tone="low">Pass</Badge> : <Badge tone="crit">Fail</Badge>;
}
